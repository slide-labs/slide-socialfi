import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram
} from '@solana/web3.js'
import {
  VAULT_PROGRAM_ID,
  VaultClient,
  decodeName,
  getVaultDepositorAddressSync
} from '@drift-labs/vaults-sdk'
import Drift from '../lib/dex/drift'
import { Wallet } from '../types/wallet'
import {
  DriftEnv,
  convertToNumber,
  getUserStatsAccountPublicKey
} from '@drift-labs/sdk'
import { BN, Program } from '@coral-xyz/anchor'
import { DriftVaults, IDL } from '@drift-labs/vaults-sdk/lib/types/drift_vaults'
import { encodeName } from '../utils/name'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from '@solana/spl-token'

export class Vault {
  drift: Drift
  vault: VaultClient
  vaultProgram: Program<DriftVaults>
  connection: Connection

  constructor(wallet: Wallet, env: DriftEnv, connection: Connection) {
    this.drift = new Drift(wallet, env, connection)
    this.vaultProgram = new Program(
      IDL,
      VAULT_PROGRAM_ID,
      this.drift.driftClient.provider
    )
    this.vault = new VaultClient({
      driftClient: this.drift.driftClient,
      program: this.vaultProgram as any,
      cliMode: false
    })
  }

  async tvl() {
    const response = await this.vaultProgram.account.vault.all()

    let tvl = 0

    response.forEach((vault) => {
      tvl += convertToNumber(
        vault.account.totalDeposits.sub(vault.account.totalWithdraws)
      )
    })

    return tvl
  }

  async getVaults() {
    const response = await this.vaultProgram.account.vault.all()

    const data = response.map((vault) => ({
      name: decodeName(vault.account.name),
      tvl: convertToNumber(
        vault.account.totalDeposits.sub(vault.account.totalWithdraws)
      ),
      totalDeposits: convertToNumber(vault.account.totalDeposits),
      totalWithdraws: convertToNumber(vault.account.totalWithdraws),
      address: vault.publicKey.toBase58(),
      createdAt: vault.account.initTs.toString(),
      tokenAccount: vault.account.tokenAccount.toBase58(),
      totalShares: convertToNumber(
        vault.account.totalDeposits
          .sub(vault.account.totalWithdraws)
          .sub(vault.account.totalShares)
      ),
      managementFee: Number(vault.account.managementFee.toString()) / 10000,
      manager: vault.account.manager.toBase58(),
      maxTokens: convertToNumber(vault.account.maxTokens),
      managerTotalProfitShare: convertToNumber(
        vault.account.managerTotalProfitShare
      ),
      profitShare: vault.account.profitShare / 10000,
      spotMarketIndex: vault.account.spotMarketIndex,
      minDepositAmount: convertToNumber(vault.account.minDepositAmount),
      isPrivate: vault.account.permissioned
    }))

    return data
  }

  /**
   * @param name The name of the vault. Vault pubkey is derived from this name.
   * @param spotMarketIndex The spot market index the vault deposits into/withdraws from
   * @param redeemPeriod the period (in seconds) that a vault depositor must wait after requesting a withdraw to complete withdraw
   * @param maxTokens  max token capacity, once hit/passed vault will reject new deposits (updateable)
   * @param minDepositAmount the minimum deposit amount
   * @param managementFee manager fee, in QUOTE_PRECISION
   * @param profitShare percentage of gains for vault admin upon depositor's realize/withdraw: PERCENTAGE_PRECISION
   * @param hurdleRate vault admin only collect incentive fees during periods when returns are higher than this amount: PERCENTAGE_PRECISION
   * @param permissioned Whether or not anybody can be a depositor
   * @returns TransactionSignature
   */
  async createVault(params: {
    name: string
    spotMarketIndex: number
    redeemPeriod: BN
    maxTokens: BN
    minDepositAmount: BN
    managementFee: BN
    profitShare: number
    hurdleRate: number
    permissioned: boolean
  }) {
    const nameEncoded = encodeName(params.name)

    this.vault.initializeVault({ ...params, name: nameEncoded })
  }

  /**
   * @param amount The amount to deposit
   * @param vaultAddress The vault address
   * @returns TransactionSignature
   */
  async deposit(params: { amount: BN; vaultAddress: PublicKey }) {
    const vaultDepositor = getVaultDepositorAddressSync(
      this.vaultProgram.programId,
      new PublicKey(params.vaultAddress),
      this.drift.driftClient.wallet.publicKey
    )
    const vaultPubKey = new PublicKey(params.vaultAddress)

    await this.drift.init()

    let hasAccount = true

    try {
      await this.vaultProgram.account.vaultDepositor.fetch(vaultDepositor)
    } catch {
      hasAccount = false
    }

    let transactions: TransactionInstruction[] = []

    const vaultAccount =
      await this.vaultProgram.account.vault.fetch(vaultPubKey)

    const remainingAccounts = this.drift.driftClient.getRemainingAccounts({
      userAccounts: [this.drift.user.getUserAccount()],
      writableSpotMarketIndexes: [vaultAccount.spotMarketIndex]
    })

    const userStatsKey = getUserStatsAccountPublicKey(
      this.drift.driftClient.program.programId,
      vaultPubKey
    )

    const driftStateKey = await this.drift.driftClient.getStatePublicKey()

    const spotMarket = this.drift.driftClient.getSpotMarketAccount(
      vaultAccount.spotMarketIndex
    )

    const accounts = {
      vault: vaultPubKey,
      vaultDepositor,
      vaultTokenAccount: vaultAccount.tokenAccount,
      driftUserStats: userStatsKey,
      driftUser: vaultAccount.user,
      driftState: driftStateKey,
      driftSpotMarketVault: spotMarket.vault,
      userTokenAccount: getAssociatedTokenAddressSync(
        spotMarket.mint,
        this.drift.driftClient.wallet.publicKey,
        true
      ),
      driftProgram: this.drift.driftClient.program.programId,
      tokenProgram: TOKEN_PROGRAM_ID
    }

    if (!hasAccount) {
      await this.vault.initializeVaultDepositor(
        vaultPubKey,
        this.drift.driftClient.wallet.publicKey
      )
    }

    const depositIx = await this.vaultProgram.methods
      .deposit(params.amount)
      .accounts({
        authority: this.drift.driftClient.wallet.publicKey,
        ...accounts,
        ...remainingAccounts
      })
      .instruction()

    transactions.push(depositIx)

    const message = new TransactionMessage({
      payerKey: new PublicKey(this.drift.driftClient.wallet.publicKey),
      recentBlockhash: (await this.drift.connection.getLatestBlockhash())
        .blockhash,
      instructions: transactions
    }).compileToV0Message()

    const transaction = new VersionedTransaction(message)

    await this.drift.wallet.signTransaction(transaction)

    await this.drift.connection.sendRawTransaction(transaction.serialize())
  }

  /**
   * @param vaultAddress The vault address
   * @returns TransactionSignature
   */
  async withdraw(params: { vaultAddress: PublicKey }) {
    await this.drift.init()

    const vaultDepositor = getVaultDepositorAddressSync(
      VAULT_PROGRAM_ID,
      params.vaultAddress,
      this.drift.wallet.publicKey
    )

    await this.vault.withdraw(vaultDepositor)
  }
}
