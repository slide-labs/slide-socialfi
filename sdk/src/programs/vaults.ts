import { TransactionSignature } from '@solana/web3.js'
import {
  VAULT_PROGRAM_ID,
  Vault,
  VaultAccount,
  VaultClient,
  getTokenVaultAddressSync,
  getVaultAddressSync
} from '@drift-labs/vaults-sdk'

export default class Vaults {
  constructor() {}

  getTopVaults() {}

  async createVault(params: { name: number[] }) {
    const vault = getVaultAddressSync(VAULT_PROGRAM_ID, params.name)
    const tokenAccount = getTokenVaultAddressSync(VAULT_PROGRAM_ID, vault)
  }

  deposit() {}

  withdraw() {}
}
