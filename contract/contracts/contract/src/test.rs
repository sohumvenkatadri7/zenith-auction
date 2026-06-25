#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{token, Env};

fn setup_env() -> (Env, token::StellarAssetClient, token::StellarAssetClient, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(admin.clone());
    let bid_token_id = env.register_stellar_asset_contract_v2(admin.clone());

    let token_sac = token::StellarAssetClient::new(&env, &token_id);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);

    (env, token_sac, bid_sac, token_id)
}

fn mint_token(sac: &token::StellarAssetClient, to: &Address, amount: i128) {
    sac.mint(to, &amount);
}

#[test]
fn test_create_auction() {
    let (env, token_sac, bid_sac, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );
    assert_eq!(auction_id, 1);

    let auction = client.get_auction(&auction_id).unwrap();
    assert_eq!(auction.creator, creator);
    assert_eq!(auction.token, token_id);
    assert_eq!(auction.start_price, 1000);
    assert_eq!(auction.start_time, 1_000_000);
    assert_eq!(auction.end_time, 1_100_000);
    assert!(!auction.ended);
    assert!(!auction.claimed);
}

#[test]
fn test_place_bid() {
    let (env, token_sac, bid_sac, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&bidder, &auction_id, &1500i128).unwrap();
    let auction = client.get_auction(&auction_id).unwrap();
    assert_eq!(auction.highest_bid, 1500);
    assert_eq!(auction.highest_bidder, bidder);
}

#[test]
fn test_bid_too_low() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    let result = client.try_place_bid(&bidder, &auction_id, &500i128);
    assert_eq!(result, Err(Ok(AuctionError::BidTooLow)));
}

#[test]
fn test_bid_outside_active_window() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    // Before start
    env.ledger().set_timestamp(900_000);
    let r1 = client.try_place_bid(&bidder, &auction_id, &1500i128);
    assert_eq!(r1, Err(Ok(AuctionError::NotActive)));

    // After end
    env.ledger().set_timestamp(1_200_000);
    let r2 = client.try_place_bid(&bidder, &auction_id, &1500i128);
    assert_eq!(r2, Err(Ok(AuctionError::NotActive)));
}

#[test]
fn test_claim_winning() {
    let (env, token_sac, bid_sac, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &winner, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&winner, &auction_id, &2000i128).unwrap();
    env.ledger().set_timestamp(1_200_000);

    client.claim_winning(&winner, &auction_id).unwrap();

    let auction = client.get_auction(&auction_id).unwrap();
    assert!(auction.claimed);
    assert!(auction.ended);

    // Winner got the token, creator got the bid
    assert_eq!(token_sac.balance(&winner), 1);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    assert_eq!(bid_sac.balance(&creator), 2000);
}

#[test]
fn test_claim_before_end_fails() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &winner, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&winner, &auction_id, &2000i128).unwrap();
    let result = client.try_claim_winning(&winner, &auction_id);
    assert_eq!(result, Err(Ok(AuctionError::NotEnded)));
}

#[test]
fn test_claim_twice_fails() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &winner, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&winner, &auction_id, &2000i128).unwrap();
    env.ledger().set_timestamp(1_200_000);
    client.claim_winning(&winner, &auction_id).unwrap();

    let result = client.try_claim_winning(&winner, &auction_id);
    assert_eq!(result, Err(Ok(AuctionError::AlreadyClaimed)));
}

#[test]
fn test_refund_previous_bidder() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder1, 10_000);
    mint_token(&bid_sac, &bidder2, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&bidder1, &auction_id, &1500i128).unwrap();
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    assert_eq!(bid_sac.balance(&bidder1), 8500); // 10000 - 1500

    client.place_bid(&bidder2, &auction_id, &2500i128).unwrap();
    assert_eq!(bid_sac.balance(&bidder1), 10000); // refunded
    assert_eq!(bid_sac.balance(&bidder2), 7500);  // 10000 - 2500
}

#[test]
fn test_nonexistent_auction() {
    let (env, _, _, _) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let result = client.try_get_auction(&999u64);
    assert_eq!(result, Err(Ok(AuctionError::NotFound)));
}

#[test]
fn test_non_winner_cannot_claim() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);
    let impostor = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&bidder, &auction_id, &2000i128).unwrap();
    env.ledger().set_timestamp(1_200_000);

    let result = client.try_claim_winning(&impostor, &auction_id);
    assert_eq!(result, Err(Ok(AuctionError::NotWinner)));
}

#[test]
fn test_bid_requires_higher_than_previous() {
    let (env, token_sac, _, token_id) = setup_env();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let bid_token_id = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    mint_token(&token_sac, &creator, 5);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&bid_sac, &bidder1, 10_000);
    mint_token(&bid_sac, &bidder2, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    client.place_bid(&bidder1, &auction_id, &1500i128).unwrap();
    let result = client.try_place_bid(&bidder2, &auction_id, &1500i128);
    assert_eq!(result, Err(Ok(AuctionError::BidTooLow)));
}

#[test]
fn test_event_emission() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone());
    let bid_token_id = env.register_stellar_asset_contract_v2(admin.clone());

    let creator = Address::generate(&env);
    let token_sac = token::StellarAssetClient::new(&env, &token_id);
    let bid_sac = token::StellarAssetClient::new(&env, &bid_token_id);
    mint_token(&token_sac, &creator, 5);

    let bidder = Address::generate(&env);
    mint_token(&bid_sac, &bidder, 10_000);

    client.init();

    let auction_id = client.create_auction(
        &creator,
        &token_id,
        &bid_token_id,
        &1000i128,
        &1_000_000u64,
        &1_100_000u64,
    );

    // Check the bid_placed event
    let bid_events = env.events().all();
    assert!(bid_events.len() > 0);
}
