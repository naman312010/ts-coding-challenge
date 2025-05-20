import { Given, Status, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction,
  TopicMessage,
  KeyList,
  Key
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
// import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/,{timeout: 60 * 1000}, async function (memo: string) {
  client.setOperator(this.account, this.privKey);
  const topicTxn = await new TopicCreateTransaction({
    submitKey: this.privKey,
    topicMemo: memo
  }).execute(client);
  const receipt = await topicTxn.getReceipt(client);
  this.topicId = receipt.topicId;
  const topicQuery = await new TopicInfoQuery({ topicId: this.topicId }).execute(client);
  assert.equal(topicQuery.topicMemo, memo);
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  client.setOperator(this.account, this.privKey);
  const msgTxn = await new TopicMessageSubmitTransaction({
    topicId: this.topicId,
    message: message,
  }).execute(client);
  const msgReceipt = await msgTxn.getReceipt(client);
  assert(msgReceipt.status)
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  client.setOperator(this.account, this.privKey);
  let receivedMsg: TopicMessage;
  new TopicMessageQuery({
    topicId: this.topicId
  }).subscribe(client, (err) => {
    console.log(err)
  }, (msg) => {
    receivedMsg = msg
    console.log(msg)
    assert.equal(receivedMsg.contents, message);
  });

  
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account2 = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey2 = privKey
  client.setOperator(this.account2, privKey);

  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  const publicKeys: Key[] = [];
  publicKeys.push(this.privKey.publicKey, this.privKey2.publicKey)
  const thresholdKey = new KeyList(publicKeys, threshold);
  this.thresholdKey = thresholdKey;
  assert(this.thresholdKey);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  client.setOperator(this.account, this.privKey);
  const topicTxn = await new TopicCreateTransaction({
    submitKey: this.thresholdKey,
    topicMemo: memo
  }).execute(client);
  const receipt = await topicTxn.getReceipt(client);
  this.topicId = receipt.topicId;
  const topicQuery = await new TopicInfoQuery({ topicId: this.topicId }).execute(client);
  assert.equal(topicQuery.topicMemo, memo);
});
