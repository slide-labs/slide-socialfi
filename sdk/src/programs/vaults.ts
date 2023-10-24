import { Connection } from '@solana/web3.js'
import {
  VAULT_PROGRAM_ID,
  VaultClient,
  getTokenVaultAddressSync,
  getVaultAddressSync
} from '@drift-labs/vaults-sdk'
import Drift from '../lib/dex/drift'
import { Wallet } from '../types/wallet'
import { DriftEnv } from '@drift-labs/sdk'
import { BN, Program } from '@coral-xyz/anchor'
import { DriftVaults, IDL } from '@drift-labs/vaults-sdk/lib/types/drift_vaults'
import { encodeName } from '../utils/name'

export default class Trading {
  drift: Drift
  vault: VaultClient
  vaultProgram: Program<DriftVaults>

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

  getTopVaults() {}

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

  deposit() {}

  withdraw() {}
}
