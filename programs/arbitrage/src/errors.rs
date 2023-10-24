use anchor_lang::prelude::*;

#[error_code]
pub enum Error {
    #[msg("Invalid account")]
    InvalidAccount,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Invalid pass type")]
    InvalidPassType,
}
