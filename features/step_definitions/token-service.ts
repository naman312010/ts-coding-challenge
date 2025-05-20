import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client, PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenInfoQuery,
  TokenType,
  ScheduleCreateTransaction,
  Key
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()

async function fetchHBar(accountId: AccountId, key: PrivateKey) {
  client.setOperator(accountId, key);
  const bal = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  return bal.hbars.toBigNumber().toNumber()
}

async function fetchTokenBal(accountId: AccountId, key: PrivateKey, tokenId: string) {
  client.setOperator(accountId, key);
  const bal = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  if (bal.tokens?.get(tokenId))
    return bal.tokens?.get(tokenId)?.toNumber()
  else
    throw new Error("no token balances found");
}

async function checkMinHBar(accountId: AccountId, key: PrivateKey, minHbar: number) {
  const hBarBal = await fetchHBar(accountId, key);
  assert.ok(hBarBal > minHbar, `Expected >${minHbar}ℏ, got ${hBarBal}`);
}

async function checkExactHBar(accountId: AccountId, key: PrivateKey, exactHBar: number) {
  const hBarBal = await fetchHBar(accountId, key);
  assert.ok(hBarBal == exactHBar, `Expected =${exactHBar}ℏ, got ${hBarBal}`);
}

async function checkExactHTT(accountId: AccountId, key: PrivateKey, exactHTT: number, tokenId: string) {
  const balHTT = await fetchTokenBal(accountId, key, tokenId);
  assert.ok(balHTT == exactHTT, `Expected =${exactHTT}ℏ, got ${balHTT}`);
}

async function tokenInitDeposit(senderAccountId: AccountId,
  senderKey: PrivateKey,
  amount: number,
  tokenId: string,
  recipient: AccountId) {
  client.setOperator(senderAccountId, senderKey);
  const tokentransferTxn = await new TransferTransaction()
    .addTokenTransfer(tokenId, senderAccountId, -amount)
    .addTokenTransfer(tokenId, recipient, amount)
    .execute(client);
  assert(tokentransferTxn, "Token Initial disbursement did not succeed")
}

async function associateWithToken(accountId: AccountId, key: PrivateKey, tokenId: string) {
  client.setOperator(accountId, key);
  const associateToken =
    await new TokenAssociateTransaction({
      tokenIds: [tokenId],
      accountId: accountId,
    }).sign(key);
  await associateToken.execute(client);
}

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[4]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
  this.accountAdmin = MY_ACCOUNT_ID
  this.pvtKeyAdmin = MY_PRIVATE_KEY

  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  client.setOperator(this.accountAdmin, this.pvtKeyAdmin);
  const testToken = await new TokenCreateTransaction({
    tokenName: "Test Token",
    tokenSymbol: "HTT",
    tokenType: TokenType.FungibleCommon,
    decimals: 2,
    adminKey: this.pvtKeyAdmin,
    treasuryAccountId: this.accountAdmin,
  }).execute(client);
  const tokenReceipt = await testToken.getReceipt(client);
  this.tokenId = tokenReceipt.tokenId;
  assert(tokenReceipt);
});

Then(/^The token has the name "([^"]*)"$/, async function (tkName: string) {
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.name, tkName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (tkSymbol: string) {
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.symbol, tkSymbol);
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.decimals, decimals);
});

Then(/^The token is owned by the account$/, async function () {
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.adminKey, this.pvtKeyAdmin);
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (toMint: number) {
  client.setOperator(this.accountAdmin, this.pvtKeyAdmin);
  await new TokenMintTransaction({
    tokenId: this.tokenId,
    amount: toMint,
  }).execute(client);
  await checkExactHTT(this.accountAdmin, this.pvtKeyAdmin, toMint, this.tokenId);
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.totalSupply, toMint);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: number) {
  client.setOperator(this.accountAdmin, this.pvtKeyAdmin);
  const testToken = await new TokenCreateTransaction({
    tokenName: "Test Token",
    tokenSymbol: "HTT",
    tokenType: TokenType.FungibleCommon,
    decimals: 2,
    adminKey: this.pvtKeyAdmin,
    treasuryAccountId: this.accountAdmin,
    maxSupply: supply,
    initialSupply: supply
  }).execute(client);
  const tokenReceipt = await testToken.getReceipt(client);
  this.tokenId = tokenReceipt.tokenId;
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.maxSupply, supply);
});

Then(/^The total supply of the token is (\d+)$/, async function (supply: number) {
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.totalSupply, supply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  client.setOperator(this.accountAdmin, this.pvtKeyAdmin);
  let mintFail = false;
  try {
    await new TokenMintTransaction({
      tokenId: this.tokenId,
      amount: 1,
    }).execute(client);
  } catch {
    mintFail = true;
  }
  assert.ok(mintFail);
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account1 = MY_ACCOUNT_ID
  this.pvtKey1 = MY_PRIVATE_KEY
  await checkMinHBar(this.account1, this.pvtKey1, expectedBalance);
});
Given(/^A second Hedera account$/, async function () {
  const account = accounts[1]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);

  this.account2 = MY_ACCOUNT_ID
  this.pvtKey2 = MY_PRIVATE_KEY
  assert.ok(this.account2 != null);
});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: number) {
  const account = accounts[4]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  this.accountAdmin = MY_ACCOUNT_ID
  this.pvtKeyAdmin = MY_PRIVATE_KEY
  client.setOperator(this.accountAdmin, this.pvtKeyAdmin);
  const testToken = await new TokenCreateTransaction({
    tokenName: "Test Token",
    tokenSymbol: "HTT",
    tokenType: TokenType.FungibleCommon,
    decimals: 2,
    adminKey: this.pvtKeyAdmin,
    treasuryAccountId: this.accountAdmin,
    initialSupply: supply
  }).execute(client);
  const tokenReceipt = await testToken.getReceipt(client);
  this.tokenId = tokenReceipt.tokenId;
  const tokenInfo = await new TokenInfoQuery({ tokenId: this.tokenId }).execute(client);
  assert.equal(tokenInfo.totalSupply, supply);
  this.initTokenDeposit = false;
  await associateWithToken(this.account1, this.pvtKey1, this.tokenId);
  await associateWithToken(this.account2, this.pvtKey2, this.tokenId);
  this.account1HBar = await fetchHBar(this.account1, this.pvtKey1);
});
Given(/^The first account holds (\d+) HTT tokens$/, async function (expectedHTT: number) {
  
  if (!this.initTokenDeposit) {
    await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account1
    );
    this.initTokenDeposit = true
  }
  await checkExactHTT(this.account1, this.pvtKey1, expectedHTT, this.tokenId);
});
Given(/^The second account holds (\d+) HTT tokens$/, async function (expectedHTT: number) {
  
  if (!this.initTokenDeposit) {
    await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account2
    );
    this.initTokenDeposit = true
  }
  await checkExactHTT(this.account2, this.pvtKey2, expectedHTT, this.tokenId);
});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (amount: number) {

  const transferBatch = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account1, -amount)
    .addTokenTransfer(this.tokenId, this.account2, amount)
    .sign(this.pvtKey1);
  assert(transferBatch)
  this.transferBatch = transferBatch;
});

When(/^The first account submits the transaction$/, async function () {

  client.setOperator(this.account1, this.pvtKey1);
  const receipt = await this.transferBatch.execute(client);
  assert(receipt);
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (amount: number) {
  const transferBatch = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account2, -amount)
    .addTokenTransfer(this.tokenId, this.account1, amount)
    .sign(this.pvtKey2);
  assert(transferBatch)
  this.transferBatch = transferBatch;
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  assert(this.account1HBar < await fetchHBar(this.account1, this.pvtKey1));
});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedHBar: number, expectedHTT: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account1 = MY_ACCOUNT_ID
  this.pvtKey1 = MY_PRIVATE_KEY
  await checkMinHBar(this.account1, this.pvtKey1, expectedHBar);
  // await associateWithToken(this.account1, this.pvtKey1, this.tokenId)
  await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account1
    );
  await checkExactHTT(this.account1, this.pvtKey1, expectedHTT, this.tokenId)
});
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (exactHBar: number, expectedHTT: number) {
  const account = accounts[1]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account2 = MY_ACCOUNT_ID
  this.pvtKey2 = MY_PRIVATE_KEY
  await checkExactHBar(this.account2, this.pvtKey2, exactHBar);
  // await associateWithToken(this.account2, this.pvtKey2, this.tokenId)
  await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account2
    );
  await checkExactHTT(this.account2, this.pvtKey2, expectedHTT, this.tokenId)
});
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (exactHBar: number, expectedHTT: number) {
  const account = accounts[2]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account3 = MY_ACCOUNT_ID
  this.pvtKey3 = MY_PRIVATE_KEY
  await checkExactHBar(this.account3, this.pvtKey3, exactHBar);
  await associateWithToken(this.account3, this.pvtKey3, this.tokenId)
  await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account3
    );
  await checkExactHTT(this.account3, this.pvtKey3, expectedHTT, this.tokenId)
});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (exactHBar: number, expectedHTT: number) {
  const account = accounts[3]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  this.account4 = MY_ACCOUNT_ID
  this.pvtKey4 = MY_PRIVATE_KEY
  await checkExactHBar(this.account4, this.pvtKey4, exactHBar);
  await associateWithToken(this.account4, this.pvtKey4, this.tokenId)
  await tokenInitDeposit(
      this.accountAdmin,
      this.pvtKeyAdmin,
      expectedHTT,
      this.tokenId,
      this.account4
    );
  await checkExactHTT(this.account4, this.pvtKey4, expectedHTT, this.tokenId)
});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (firstsecond: number, third: number, fourth: number) {
  client.setOperator(this.account1, this.pvtKey1);
  const transferBatch = new TransferTransaction()
    .addTokenTransfer(this.tokenId, this.account1, -firstsecond)
    .addTokenTransfer(this.tokenId, this.account2, -firstsecond)
    .addTokenTransfer(this.tokenId, this.account3, third)
    .addTokenTransfer(this.tokenId, this.account4, fourth)
    .freezeWith(client)
    .sign(this.pvtKey2)
  
  const scheduled = (await transferBatch).schedule()
  const fullySigned = scheduled.sign(this.pvtKey1)
  this.transferBatch = fullySigned

});
Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedHTT: number) {
  await checkExactHTT(this.account3, this.pvtKey3, expectedHTT, this.tokenId);
});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedHTT: number) {
  await checkExactHTT(this.account4, this.pvtKey4, expectedHTT, this.tokenId);
});
