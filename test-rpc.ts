import { Connection, PublicKey } from '@solana/web3.js';

async function testRpc() {
  console.log('Testing RPCs...');

  const baseRpcUrl = 'https://api.devnet.solana.com';
  const erRpcUrl = 'https://devnet.magicblock.app';
  
  const baseConnection = new Connection(baseRpcUrl, 'confirmed');
  const erConnection = new Connection(erRpcUrl, 'confirmed');

  // Any valid public key on devnet
  const testAccount = new PublicKey('4ntG17Y9eHHDoyBG43qaMykYdVNH1XtxdjxpzVFwTDcB'); // The one from the warning

  console.time('Base RPC getAccountInfo');
  try {
    await baseConnection.getAccountInfo(testAccount, 'confirmed');
    console.timeEnd('Base RPC getAccountInfo');
    console.log('Base RPC is responsive for getAccountInfo.');
  } catch (error: any) {
    console.timeEnd('Base RPC getAccountInfo');
    console.error('Base RPC failed:', error.message);
  }

  console.time('ER RPC getAccountInfo');
  try {
    await erConnection.getAccountInfo(testAccount, 'confirmed');
    console.timeEnd('ER RPC getAccountInfo');
    console.log('ER RPC is responsive for getAccountInfo.');
  } catch (error: any) {
    console.timeEnd('ER RPC getAccountInfo');
    console.error('ER RPC failed:', error.message);
  }

  console.log('\nTesting getTransaction (dummy signature)...');
  const dummySignature = '2dW6bZBNJE2dzxF4dUQzJiyyCKGUVSbHeRzjpkAkBpMGzELSK1mdTAH4NUNBNGfKGfiKsnU3DeTbzRJc4vwGq11V'; // The one from the fee warning
  
  console.time('ER RPC getTransaction');
  try {
    await erConnection.getTransaction(dummySignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    console.timeEnd('ER RPC getTransaction');
    console.log('ER RPC is responsive for getTransaction.');
  } catch (error: any) {
    console.timeEnd('ER RPC getTransaction');
    console.error('ER RPC failed getTransaction:', error.message);
  }
}

testRpc().catch(console.error);
