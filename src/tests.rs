use alloy::{
    primitives::{Address, FixedBytes, U256}, providers::{Provider, ProviderBuilder, ext::AnvilApi}, rpc::client::RpcClient,
};
use rand::random;

use crate::{MerkleTree, Payment, PrivateKey, Targets, bindings::Refuje::RefujeInstance};

#[test]
fn a() {
    let p = ProviderBuilder::new().connect_http("http://localhost:8545".try_into().unwrap());
    let address = Address(FixedBytes(random()));
    let address2 = Address(FixedBytes(random()));
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(async move {
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
            contract_instance
                .depositToKey(U256::from_be_bytes(key.0))
                .value(U256::from(10u64.pow(9)))
                .from(address)
                .call()
                .await
                .unwrap();
            let mut m = MerkleTree::None;
            let mut targets = Targets::default();
            targets.push_address(U256::from(10u64.pow(9) - 10u64.pow(9) >> 7), address2);
            let p2 = Payment::Eth
                .pay(key, [0u8; 32], &mut m)
                .finalize(targets, &m);
            match p2 {
                crate::PaymentCall::Eth(widthdraw_eth_call) => {
                    contract_instance
                        .call_builder(&widthdraw_eth_call)
                        .from(address)
                        .call()
                        .await
                        .unwrap();
                }
                crate::PaymentCall::Erc20(widthdraw_erc20_call) => {
                    contract_instance
                        .call_builder(&widthdraw_erc20_call)
                        .from(address)
                        .call()
                        .await
                        .unwrap();
                }
            };
            assert_eq!(p.get_balance(address2).await.unwrap(), 10u64.pow(9) - 10u64.pow(9) >> 7);
        });
}
