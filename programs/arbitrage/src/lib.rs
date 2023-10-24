use anchor_lang::prelude::*;

declare_id!("3pRCczvKX3eUmgwHpf9jLjoWykLw19CT2TXyisSweL5w");

#[program]
pub mod arbitrage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
