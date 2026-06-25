#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol,
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
            highest_bidder: creator.clone(),
            start_time,
            end_time,
            ended: false,
            claimed: false,
        };

        env.storage().instance().set(&DataKey::Auction(id), &auction);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        env.events().publish((Symbol::new(&env, "auction_created"),), (creator, id));
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

        // Refund previous highest bidder
        if auction.highest_bid > 0 {
            token::Client::new(&env, &auction.bid_token).transfer(
                &env.current_contract_address(),
                &auction.highest_bidder,
                &auction.highest_bid,
            );
        }

        // Transfer new bid
        token::Client::new(&env, &auction.bid_token).transfer(
            &bidder,
            &env.current_contract_address(),
            &amount,
        );

        auction.highest_bid = amount;
        auction.highest_bidder = bidder.clone();
        env.storage()
            .instance()
            .set(&DataKey::Auction(auction_id), &auction);

        env.events().publish(
            (Symbol::new(&env, "bid_placed"),),
            (auction_id, bidder, amount),
        );
        Ok(())
    }

    pub fn claim_winning(
        env: Env,
        caller: Address,
        auction_id: u64,
    ) -> Result<(), AuctionError> {
        caller.require_auth();

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
        if caller != auction.highest_bidder {
            return Err(AuctionError::NotWinner);
        }
        if auction.highest_bid == 0 {
            return Err(AuctionError::NoBids);
        }

        auction.ended = true;
        auction.claimed = true;

        // Transfer token to winner
        token::Client::new(&env, &auction.token).transfer(
            &env.current_contract_address(),
            &caller,
            &1i128,
        );
        // Transfer bid to creator
        token::Client::new(&env, &auction.bid_token).transfer(
            &env.current_contract_address(),
            &auction.creator,
            &auction.highest_bid,
        );

        env.storage()
            .instance()
            .set(&DataKey::Auction(auction_id), &auction);

        env.events().publish(
            (Symbol::new(&env, "auction_claimed"),),
            (auction_id, caller, auction.creator, auction.highest_bid),
        );
        Ok(())
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Result<Auction, AuctionError> {
        env.storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .ok_or(AuctionError::NotFound)
    }
}

mod test;
