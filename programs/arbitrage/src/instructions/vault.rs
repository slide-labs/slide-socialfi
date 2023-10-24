use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{CreateVaultArgs, Vault};

#[derive(Accounts)]
#[instruction(args: CreateVaultArgs)]
pub struct CreateVault<'info> {
    #[account(init, payer = payer, space = Vault::SPACE, seeds = [Vault::PREFIX_SEED.as_ref(), args.name.as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    #[account(
      init,
      seeds = [Vault::TOKEN_ACCOUNT_PREFIX_SEED.as_ref(), vault.key().as_ref()],
      bump,
      payer = payer,
      token::mint = token_mint,
      token::authority = vault,
    )]
    pub token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>,

    pub manager: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,
}

pub fn create_vault(ctx: Context<CreateVault>, args: CreateVaultArgs) -> Result<()> {
    Ok(())
}
