use crate::state::*;
use anchor_lang::prelude::*;
use instructions::*;

mod instructions;
mod state;


declare_id!("3pRCczvKX3eUmgwHpf9jLjoWykLw19CT2TXyisSweL5w");

#[program]
pub mod arbitrage {
    use super::*;

    pub fn create_vault(ctx: Context<CreateVault>, args: CreateVaultArgs) -> Result<()> {
        instructions::create_vault(ctx, args)
    }
}
