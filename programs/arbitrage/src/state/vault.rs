use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// The bump for the vault pda
    pub bump: u8,
    
    /// The name of the vault. Vault pubkey is derived from this name.
    pub name: [u8; 32],

    /// The vault's pubkey. It is a pda of name
    pub pubkey: Pubkey,

    /// The manager of the vault who has ability to update vault params
    pub manager: Pubkey,

    /// The vaults token account. Used to receive tokens between deposits and withdrawals
    pub token_account: Pubkey,

    /// the sum of all shares
    pub total_shares: u128,

    /// fee for profit sharing
    pub fee: i64,

    /// timestamp of the initialization
    pub ts: i64,

    /// total deposits
    pub total_deposits: u64,

    /// total withdraws
    pub total_withdraws: u64,

    /// the minimum deposit amount
    pub min_deposit_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateVaultArgs {
    pub name: [u8; 32],
    pub profit_share: u32,
    pub fee: u32,
}

impl Vault {
    /// static prefix seed string used to derive the PDAs
    pub const PREFIX_SEED: &[u8] = b"vault";

    // static prefix seed string used to derive the PDAs
    pub const TOKEN_ACCOUNT_PREFIX_SEED: &[u8] = b"vault_token_account";

    /// total on-chain space needed to allocate the account
    pub const SPACE: usize =
        // anchor descriminator + all static variables
        8 + std::mem::size_of::<Self>();
}
