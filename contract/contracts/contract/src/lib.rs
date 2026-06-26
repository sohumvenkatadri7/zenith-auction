#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    NotFound = 1,
    NotEnded = 2,
    AlreadyClaimed = 3,
    BidTooLow = 4,
    NotActive = 5,
    NotWinner = 6,
    NoBids = 7,
    HasBids = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auction {
    pub id: u64,
    pub creator: Address,
    pub token: Address,
    pub bid_token: Address,
    pub start_price: i128,
    pub highest_bid: i128,
    pub highest_bidder: Address,
    pub start_time: u64,
    pub end_time: u64,
    pub ended: bool,
    pub claimed: bool,
}

#[contracttype]
pub enum DataKey {
    NextId,
    Auction(u64),
}

// --- NEW: MACRO-BASED EVENT STRUCTS ---

// When you use #[contractevent], the snake_case name of the struct 
// automatically becomes the primary topic (e.g., "auction_created")

#[contractevent]
pub struct AuctionCreated {
    pub creator: Address,
    pub auction_id: u64,
}

#[contractevent]
pub struct BidPlaced {
    pub auction_id: u64,
    pub bidder: Address,
    pub amount: i128,
}

#[contractevent]
pub struct AuctionClaimed {
    pub auction_id: u64,
    pub winner: Address,
    pub creator: Address,
    pub amount: i128,
}

#[contractevent]
pub struct AuctionReclaimed {
    pub auction_id: u64,
    pub creator: Address,
}

// ---------------------------------------

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn init(env: Env) {
        env.storage().instance().set(&DataKey::NextId, &1u64);
    }

    pub fn create_auction(
        env: Env,
        creator: Address,
        token: Address,
        bid_token: Address,
        start_price: i128,
        start_time: u64,
        end_time: u64,
    ) -> u64 {
        creator.require_auth();

        // Lock the item being auctioned into the contract
        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &1i128,
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(1u64);

        let auction = Auction {
            id,
            creator: creator.clone(),
            token,
            bid_token,
            start_price,
            highest_bid: 0i128,
            highest_bidder: creator.clone(), // Defaults to creator until a bid is placed
            start_time,
            end_time,
            ended: false,
            claimed: false,
        };

        env.storage().instance().set(&DataKey::Auction(id), &auction);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        // Publish the struct event
        AuctionCreated {
            creator,
            auction_id: id,
        }
        .publish(&env);
        
        id
    }

    pub fn place_bid(
        env: Env,
        bidder: Address,
        auction_id: u64,
        amount: i128,
    ) -> Result<(), AuctionError> {
        bidder.require_auth();

        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        let now = env.ledger().timestamp();
        if now < auction.start_time || now > auction.end_time {
            return Err(AuctionError::NotActive);
        }
        if auction.ended || auction.claimed {
            return Err(AuctionError::NotActive);
        }

        let min_bid = if auction.highest_bid == 0 {
            auction.start_price
        } else {
            auction.highest_bid + 1
        };
        
        if amount < min_bid {
            return Err(AuctionError::BidTooLow);
        }

        // Refund the previous highest bidder automatically
        if auction.highest_bid > 0 {
            token::Client::new(&env, &auction.bid_token).transfer(
                &env.current_contract_address(),
                &auction.highest_bidder,
                &auction.highest_bid,
            );
        }

        // Transfer the new bid into the contract
        token::Client::new(&env, &auction.bid_token).transfer(
            &bidder,
            &env.current_contract_address(),
            &amount,
        );

        auction.highest_bid = amount;
        auction.highest_bidder = bidder.clone();
        
        env.storage().instance().set(&DataKey::Auction(auction_id), &auction);
        
        // Publish the struct event
        BidPlaced {
            auction_id,
            bidder,
            amount,
        }
        .publish(&env);
        
        Ok(())
    }

    pub fn claim_winning(
        env: Env,
        auction_id: u64,
    ) -> Result<(), AuctionError> {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        if env.ledger().timestamp() <= auction.end_time {
            return Err(AuctionError::NotEnded);
        }
        if auction.claimed {
            return Err(AuctionError::AlreadyClaimed);
        }
        if auction.highest_bid == 0 {
            return Err(AuctionError::NoBids);
        }

        auction.ended = true;
        auction.claimed = true;

        // Route the NFT/Token to the winner
        token::Client::new(&env, &auction.token).transfer(
            &env.current_contract_address(),
            &auction.highest_bidder,
            &1i128,
        );
        
        // Route the money to the creator
        token::Client::new(&env, &auction.bid_token).transfer(
            &env.current_contract_address(),
            &auction.creator,
            &auction.highest_bid,
        );

        env.storage().instance().set(&DataKey::Auction(auction_id), &auction);
        
        // Publish the struct event
        AuctionClaimed {
            auction_id,
            winner: auction.highest_bidder.clone(),
            creator: auction.creator.clone(),
            amount: auction.highest_bid,
        }
        .publish(&env);
        
        Ok(())
    }

    pub fn reclaim_unsold(
        env: Env,
        auction_id: u64,
    ) -> Result<(), AuctionError> {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)?;

        if env.ledger().timestamp() <= auction.end_time {
            return Err(AuctionError::NotEnded);
        }
        if auction.claimed {
            return Err(AuctionError::AlreadyClaimed);
        }
        if auction.highest_bid > 0 {
            return Err(AuctionError::HasBids);
        }

        auction.ended = true;
        auction.claimed = true;

        // Return the NFT/Token back to the creator
        token::Client::new(&env, &auction.token).transfer(
            &env.current_contract_address(),
            &auction.creator,
            &1i128,
        );

        env.storage().instance().set(&DataKey::Auction(auction_id), &auction);
        
        // Publish the struct event
        AuctionReclaimed {
            auction_id,
            creator: auction.creator.clone(),
        }
        .publish(&env);
        
        Ok(())
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Result<Auction, AuctionError> {
        env.storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)
    }
}

#[cfg(test)]
mod test;
