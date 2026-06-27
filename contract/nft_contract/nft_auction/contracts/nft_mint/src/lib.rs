#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum NFTError {
    NotAuthorized = 1,
    TokenNotFound = 2,
    TokenAlreadyExists = 3,
    NotInitialized = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    NextTokenId,
    TokenOwner(i128),
    TokenUri(i128),
    Approval(i128),
}

#[contractevent]
pub struct NFTMinted {
    pub token_id: i128,
    pub owner: Address,
    pub metadata_uri: String,
}

#[contractevent]
pub struct NFTTransferred {
    pub token_id: i128,
    pub from: Address,
    pub to: Address,
}

// FEATURE: BURN-TO-REDEEM
#[contractevent]
pub struct NFTBurned {
    pub token_id: i128,
    pub owner: Address,
}

#[contract]
pub struct NonFungibleToken;

#[contractimpl]
impl NonFungibleToken {
    /// Initializes the contract setting the administrative authority
    /// (Kept intact so your frontend `initializeContract` sequence doesn't break)
    pub fn initialize(env: Env, admin: Address) -> Result<(), NFTError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(NFTError::TokenAlreadyExists);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTokenId, &1i128);
        Ok(())
    }

    /// Mints a new unique token ID linked to an unchangeable IPFS metadata URI
    pub fn mint(env: Env, to: Address, metadata_uri: String) -> Result<i128, NFTError> {
        // FIX: The user minting the asset authorizes their own transaction.
        // No longer restricted to the contract Admin!
        to.require_auth();

        // Get the next valid automated Token ID
        let token_id: i128 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1i128);

        // Assign ownership and map metadata storage identifiers
        env.storage().instance().set(&DataKey::TokenOwner(token_id), &to);
        env.storage().instance().set(&DataKey::TokenUri(token_id), &metadata_uri);
        
        // Increment global token counter tracking state
        env.storage().instance().set(&DataKey::NextTokenId, &(token_id + 1));

        // Stream real-time mint event on ledger
        NFTMinted {
            token_id,
            owner: to.clone(),
            metadata_uri,
        }
        .publish(&env);

        Ok(token_id)
    }

    /// Transfers unique asset identifier ownership mappings across accounts
    pub fn transfer(env: Env, from: Address, to: Address, token_id: i128) -> Result<(), NFTError> {
        from.require_auth();

        // Verify existing structural ownership records
        let current_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        // Remap asset holder address state
        env.storage().instance().set(&DataKey::TokenOwner(token_id), &to);

        // Stream real-time transfer event on ledger
        NFTTransferred {
            token_id,
            from,
            to,
        }
        .publish(&env);

        Ok(())
    }

    /// Public getter returning the current asset holder address configuration
    pub fn owner_of(env: Env, token_id: i128) -> Result<Address, NFTError> { 
       env.storage().instance().get(&DataKey::TokenOwner(token_id)).ok_or(NFTError::TokenNotFound)
    }

    /// Public getter returning the associated IPFS storage path link metadata string
    pub fn token_uri(env: Env, token_id: i128) -> Result<String, NFTError> {
        env.storage().instance().get(&DataKey::TokenUri(token_id)).ok_or(NFTError::TokenNotFound)
    }

    /// Approve an address to transfer a specific token on behalf of the owner
    pub fn approve(env: Env, owner: Address, spender: Address, token_id: i128) -> Result<(), NFTError> {
        owner.require_auth();

        let current_owner: Address = env
            .storage().instance().get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != owner {
            return Err(NFTError::NotAuthorized);
        }

        env.storage().instance().set(&DataKey::Approval(token_id), &spender);
        Ok(())
    }

    /// Transfer a token using approval (called by the approved spender, e.g. auction contract)
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: i128) -> Result<(), NFTError> {
        spender.require_auth();

        let approved: Address = env
            .storage().instance().get(&DataKey::Approval(token_id))
            .ok_or(NFTError::NotAuthorized)?;

        if approved != spender {
            return Err(NFTError::NotAuthorized);
        }

        let current_owner: Address = env
            .storage().instance().get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        env.storage().instance().set(&DataKey::TokenOwner(token_id), &to);
        env.storage().instance().remove(&DataKey::Approval(token_id));

        NFTTransferred { token_id, from, to }.publish(&env);

        Ok(())
    }

    /// FEATURE: BURN-TO-REDEEM
    /// Destroys the digital asset. Used when the physical item is claimed in the real world.
    pub fn burn(env: Env, from: Address, token_id: i128) -> Result<(), NFTError> {
        from.require_auth();

        let current_owner: Address = env
            .storage().instance().get(&DataKey::TokenOwner(token_id))
            .ok_or(NFTError::TokenNotFound)?;

        if current_owner != from {
            return Err(NFTError::NotAuthorized);
        }

        // Permanently erase the token state from the ledger
        env.storage().instance().remove(&DataKey::TokenOwner(token_id));
        env.storage().instance().remove(&DataKey::TokenUri(token_id));
        env.storage().instance().remove(&DataKey::Approval(token_id));

        // Stream real-time burn event on ledger
        NFTBurned {
            token_id,
            owner: from,
        }
        .publish(&env);

        Ok(())
    }
}