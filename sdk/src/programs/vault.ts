import { Connection, PublicKey } from '@solana/web3.js'
import {
  VAULT_PROGRAM_ID,
  VaultClient,
  decodeName,
  getVaultDepositorAddressSync
} from '@drift-labs/vaults-sdk'
import Drift from '../lib/dex/drift'
import { Wallet } from '../types/wallet'
import { DriftEnv, convertToNumber } from '@drift-labs/sdk'
import { BN, Program } from '@coral-xyz/anchor'
import { DriftVaults, IDL } from '@drift-labs/vaults-sdk/lib/types/drift_vaults'
import { encodeName } from '../utils/name'

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
      spotMarketIndex: vault.account.spotMarketIndex
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
      VAULT_PROGRAM_ID,
      params.vaultAddress,
      this.drift.wallet.publicKey
    )

    await this.vault.deposit(vaultDepositor, params.amount, {
      authority: this.drift.wallet.publicKey,
      vault: params.vaultAddress
    })
  }

  /**
   * @param vaultAddress The vault address
   * @returns TransactionSignature
   */
  async withdraw(params: { vaultAddress: PublicKey }) {
    const vaultDepositor = getVaultDepositorAddressSync(
      VAULT_PROGRAM_ID,
      params.vaultAddress,
      this.drift.wallet.publicKey
    )

    await this.vault.withdraw(vaultDepositor)
  }
}
