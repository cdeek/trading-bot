import { Transaction, SystemProgram } from '@solana/web3.js';
import { connection, wallet } from './solanaClient.js';

export async function sendSol(recipientPubkey, amountSol) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: recipientPubkey,
      lamports: amountSol * 1e9,
    })
  );

  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}