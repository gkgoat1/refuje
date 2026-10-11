use alloy::{
    primitives::{Address, FixedBytes, U256},
    providers::{Provider, ProviderBuilder, ext::AnvilApi},
    rpc::client::RpcClient,
};
use rand::random;

use crate::{MerkleTree, Payment, PrivateKey, Targets, bindings::Refuje::RefujeInstance};

#[test]
fn pubkey_recovers() {
    let p = PrivateKey(random());
    let hash = random();
    assert_eq!(p.pubkey(), p.sign(hash).recover(hash));
}

#[tokio::main]
#[test]
async fn a() {
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
    eprintln!("len: {}", targets.0.len());
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
    eprintln!("{:?}",key);
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
