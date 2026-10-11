use alloy::{
    primitives::{Address, Bytes, FixedBytes, U256, keccak256},
    providers::{Provider, ProviderBuilder, ext::AnvilApi},
    sol_types::SolValue,
};
use rand::random;

use crate::{
    MerkleTree, Payment, PrivateKey, Targets, bindings::Refuje::RefujeInstance, bools_bytes,
};

#[test]
fn pubkey_recovers() {
    let p = PrivateKey(random());
    let hash = random();
    assert_eq!(p.pubkey(), p.sign(hash).recover(hash));
}

#[test]
fn abi_preimages_match_solidity_argument_encoding() {
    let targets = Targets::default();
    assert_eq!(
        targets.pay(&Payment::Eth),
        ("pay", "", Bytes::default()).abi_encode_params()
    );

    let path = [0u8; 32];
    let hashed_path = keccak256(("pay", "", FixedBytes(path)).abi_encode_params()).0;
    let mut tree = MerkleTree::None;
    let post = Payment::Eth.pay(PrivateKey([1; 32]), path, &mut tree);
    assert_eq!(post.path, path);
    assert_eq!(post.tree_path, hashed_path);
    let proof = tree.prove(bools_bytes(&hashed_path)).unwrap();
    let mut root = post.key.pubkey().0;
    for (i, sibling) in proof.into_iter().enumerate() {
        let path_bit = (hashed_path[i >> 3] >> (i & 7)) & 1 != 0;
        let (left, right) = if path_bit {
            (sibling, root)
        } else {
            (root, sibling)
        };
        root = keccak256((FixedBytes(left), FixedBytes(right)).abi_encode_packed()).0;
    }
    assert_eq!(root, tree.hash());
}

#[tokio::main]
#[test]
async fn withdraws_eth_to_target() {
    let p = ProviderBuilder::new().connect_http("http://localhost:8545".try_into().unwrap());
    let address = Address(FixedBytes(random()));
    let address2 = Address(FixedBytes(random()));

    p.anvil_set_balance(address, U256::from(10).pow(U256::from(18)))
        .await
        .unwrap();
    let contract_instance = RefujeInstance::deploy_builder(p.clone())
        .from(address)
        .deploy()
        .await
        .unwrap();
    let contract_instance = RefujeInstance::new(contract_instance, p.clone());
    let key = PrivateKey(random());
    let mut m = MerkleTree::None;
    let mut targets = Targets::default();
    targets.push_address(U256::from(10u64.pow(9) - (10u64.pow(9) >> 7)), address2);
    let p2 = Payment::Eth
        .pay(PrivateKey(key.0), [0u8; 32], &mut m)
        .finalize(targets, &m);
    contract_instance
        .registerPubKey(FixedBytes(key.pubkey().0))
        .from(address)
        .send_sync()
        .await
        .unwrap();
    let key = U256::from_be_bytes(m.hash());
    contract_instance
        .depositToKey(key)
        .value(U256::from(10u64.pow(9)))
        .from(address)
        .send_sync()
        .await
        .unwrap();
    match p2 {
        crate::PaymentCall::Eth(widthdraw_eth_call) => {
            contract_instance
                .call_builder(&widthdraw_eth_call)
                .from(address)
                .send_sync()
                .await
                .unwrap();
        }
        crate::PaymentCall::Erc20(widthdraw_erc20_call) => {
            contract_instance
                .call_builder(&widthdraw_erc20_call)
                .from(address)
                .send_sync()
                .await
                .unwrap();
        }
    };
    assert_eq!(
        p.get_balance(address2).await.unwrap(),
        10u64.pow(9) - (10u64.pow(9) >> 7)
    );
}
