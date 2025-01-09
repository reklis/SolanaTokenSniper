import postgres from 'postgres'

const sql = postgres()

import { HoldingRecord, NewTokenRecord } from "../types";

// Tracker
export async function createTableHoldings(): Promise<boolean> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS holdings (
        id SERIAL PRIMARY KEY,
        time BIGINT NOT NULL,
        token TEXT NOT NULL,
        token_name TEXT NOT NULL,
        balance REAL NOT NULL,
        sol_paid REAL NOT NULL,
        sol_fee_paid REAL NOT NULL,
        sol_paid_usdc REAL NOT NULL,
        sol_fee_paid_usdc REAL NOT NULL,
        per_token_paid_usdc REAL NOT NULL,
        slot BIGINT NOT NULL,
        program TEXT NOT NULL
      );
    `
    return true;
  } catch (error: any) {
    console.error(error);
    return false;
  }
}

export async function selectAllHoldings(): Promise<HoldingRecord[]> {
  const holdings = await sql`
    SELECT * FROM holdings;
  `
  return holdings.map((holding) => ({
    time: holding.time,
    token: holding.token,
    token_name: holding.token_name,
    balance: holding.balance,
    sol_paid: holding.sol_paid,
    sol_fee_paid: holding.sol_fee_paid,
    sol_paid_usdc: holding.sol_paid_usdc,
    sol_fee_paid_usdc: holding.sol_fee_paid_usdc,
    per_token_paid_usdc: holding.per_token_paid_usdc,
    slot: holding.slot,
    program: holding.program,
  }));
}

export async function insertHolding(holding: HoldingRecord) {
  const holdingsTableExist = await createTableHoldings();
  if (!holdingsTableExist) {
    return;
  }

  // Proceed with adding holding
  if (holdingsTableExist) {
    const { time, token, token_name, balance, sol_paid, sol_fee_paid, sol_paid_usdc, sol_fee_paid_usdc, per_token_paid_usdc, slot, program } = holding;
    await sql`
      INSERT INTO holdings (time, token, token_name, balance, sol_paid, sol_fee_paid, sol_paid_usdc, sol_fee_paid_usdc, per_token_paid_usdc, slot, program)
      VALUES (${time}, ${token}, ${token_name}, ${balance}, ${sol_paid}, ${sol_fee_paid}, ${sol_paid_usdc}, ${sol_fee_paid_usdc}, ${per_token_paid_usdc}, ${slot}, ${program});
    `
  }
}

export async function removeHolding(tokenMint: string) {
  await sql`
    DELETE FROM holdings
    WHERE Token = ${tokenMint};
  `
}


// New token duplicates tracker
export async function createTableNewTokens(): Promise<boolean> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        time INTEGER NOT NULL,
        name TEXT NOT NULL,
        mint TEXT NOT NULL,
        creator TEXT NOT NULL
      );
    `
    return true;
  } catch (error: any) {
    return false;
  }
}

export async function insertNewToken(newToken: NewTokenRecord) {
  const newTokensTableExist = await createTableNewTokens();
  if (!newTokensTableExist) {
    return;
  }

  // Proceed with adding holding
  if (newTokensTableExist) {
    const { time, name, mint, creator } = newToken;

    await sql`
      INSERT INTO tokens (time, name, mint, creator)
      VALUES (${time}, ${name}, ${mint}, ${creator});
    `
  }
}

export async function selectTokenByNameAndCreator(name: string, creator: string): Promise<NewTokenRecord[]> {
  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens();
  if (!newTokensTableExist) {
    return [];
  }

  // Query the database for matching tokens
  const tokens = await sql`
    SELECT * 
    FROM tokens
    WHERE name = ${name} OR creator = ${creator};
  `

  // Return the results
  return tokens.map((token) => ({
    time: token.time,
    name: token.name,
    mint: token.mint,
    creator: token.creator,
  }));
}

export async function selectTokenByMint(mint: string): Promise<NewTokenRecord[]> {
  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens();
  if (!newTokensTableExist) {
    return [];
  }

  // Query the database for matching tokens
  const tokens = await sql`
    SELECT * 
    FROM tokens
    WHERE mint = ${mint};
  `

  // Return the results
  return tokens.map((token) => ({
    time: token.time,
    name: token.name,
    mint: token.mint,
    creator: token.creator,
  }));
}

export async function selectAllTokens(): Promise<NewTokenRecord[]> {
  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens();
  if (!newTokensTableExist) {
    return [];
  }

  // Query the database for matching tokens
  const tokens = await sql`
    SELECT * 
    FROM tokens;
  `
  // Return the results
  return tokens.map((token) => ({
    time: token.time,
    name: token.name,
    mint: token.mint,
    creator: token.creator,
  }));
}
