import WebSocket from "ws"; // Node.js websocket library
import dotenv from "dotenv"; // zero-dependency module that loads environment variables from a .env
import { HoldingRecord, WebSocketRequest } from "./types"; // Typescript Types for type safety
import { config } from "./config"; // Configuration parameters for our bot
import { fetchTransactionDetails, createSwapTransaction, getRugCheckConfirmed, fetchAndSaveSwapDetails } from "./transactions";
import { getBuyQuote, getPrice } from "./lib/jup";
import { sendDiscordMessage } from "./lib/discord";
import { insertHolding } from "./tracker/db";

// Load environment variables from the .env file
dotenv.config();
let activeTransactions = 0;
const MAX_CONCURRENT = config.tx.concurrent_transactions;

// Function used to open our websocket connection
function sendSubscribeRequest(ws: WebSocket): void {
  const request: WebSocketRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [
      {
        mentions: [config.liquidity_pool.radiyum_program_id],
      },
      {
        commitment: "processed", // Can use finalized to be more accurate.
      },
    ],
  };
  ws.send(JSON.stringify(request));
}
// Function used to close other connections
function sendUnsubscribeRequest(ws: WebSocket): void {
  const request: WebSocketRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsUnsubscribe",
    params: [],
  };
  ws.send(JSON.stringify(request));
}

// Function used to handle the transaction once a new pool creation is found
async function processTransaction(signature: string): Promise<void> {
  // Output logs
  console.log("=============================================");
  console.log("🔎 New Liquidity Pool found.");
  console.log("🔃 Fetching transaction details ...");

  // Fetch the transaction details
  const data = await fetchTransactionDetails(signature);
  if (!data) {
    console.log("⛔ Transaction aborted. No data returned.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  // Ensure required data is available
  if (!data.solMint || !data.tokenMint) return;

  // Check rug check
  const isRugCheckPassed = await getRugCheckConfirmed(data.tokenMint);
  if (!isRugCheckPassed) {
    console.log("🚫 Rug Check not passed! Transaction aborted.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  // Handle ignored tokens
  if (data.tokenMint.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
    // Check if ignored
    console.log("🚫 Transaction skipped. Ignoring Pump.fun.");
    console.log("🟢 Resuming looking for new tokens..\n");
    return;
  }

  // Ouput logs
  console.log("Token found");
  console.log("👽 GMGN: https://gmgn.ai/sol/token/" + data.tokenMint);
  console.log("😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=" + data.tokenMint);

  if (config.rug_check.notify_discord && process.env.DISCORD_WEBHOOK_URL) {
    sendDiscordMessage(`New Token Found: https://gmgn.ai/sol/token/${data.tokenMint}`);
  }

  // // Check if simulation mode is enabled
  // if (config.rug_check.simulation_mode) {
  //   console.log("👀 Token not swapped. Simulation mode is enabled.");
  //   console.log("🟢 Resuming looking for new tokens..\n");
  //   return;
  // }

  // Add initial delay before first buy
  await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

  // Create Swap transaction
  const tx = (config.rug_check.simulation_mode)
    ? Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    : await createSwapTransaction(data.solMint, data.tokenMint);

  if (!tx) {
    console.log("⛔ Transaction aborted. No valid id returned.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  if (!config.rug_check.simulation_mode) {
    // Output logs
    console.log("✅ Swap quote recieved.");
    console.log("🚀 Swapping SOL for Token.");
    console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

    // Fetch and store the transaction for tracking purposes
    const saveConfirmation = await fetchAndSaveSwapDetails(tx);
    if (!saveConfirmation) {
      console.log("❌ Warning: Transaction not saved for tracking! Track Manually!");
    }
  } else {
      // insert simulated tx into db

      const tokenPrice = await getPrice([data.tokenMint, config.liquidity_pool.wsol_pc_mint]);
      console.log("💰 Token Price: ", tokenPrice[data.tokenMint]?.price);
  
      const buyQuote = await getBuyQuote(data.tokenMint, config.swap.amount);
      console.log("💰 Buy Quote: ", buyQuote);
      const solPriceUsdc = tokenPrice[config.liquidity_pool.wsol_pc_mint]?.price
      const solPaidUsdc = solPriceUsdc * 0.01;
      const tokenAmount = buyQuote.outAmount / 1_000_000_000;
      const solFeePaidUsdc = solPriceUsdc * 0.001;
      const perTokenUsdcPrice = solPaidUsdc / tokenAmount;

      console.log("💰 Token Amount: ", tokenAmount);
      console.log("💰 Sol Fee Paid: ", solFeePaidUsdc);
      console.log("💰 Per Token Usdc Price: ", perTokenUsdcPrice);
  
      const newHolding: HoldingRecord = {
        time: Date.now(),
        token: data.tokenMint,
        token_name: data.tokenMint,
        balance: tokenAmount,
        sol_paid: 0.01,
        sol_fee_paid: solFeePaidUsdc,
        sol_paid_usdc: solPaidUsdc,
        sol_fee_paid_usdc: solFeePaidUsdc,
        per_token_paid_usdc: perTokenUsdcPrice,
        slot: 1,
        program: "simulated_program",
      };

      await insertHolding(newHolding);
      sendDiscordMessage(`New Holding: sol fee ${solFeePaidUsdc} usdc, token amount ${tokenAmount}, per token usdc price ${perTokenUsdcPrice}, token price: ${tokenPrice[data.tokenMint]?.price}`);

  }
}

let init = false;
async function websocketHandler(): Promise<void> {
  // Create a WebSocket connection
  let ws: WebSocket | null = new WebSocket(process.env.HELIUS_WSS_URI || "");
  if (!init) console.clear();

  // @TODO, test with hosting our app on a Cloud instance closer to the RPC nodes physical location for minimal latency
  // @TODO, test with different RPC and API nodes (free and paid) from quicknode and shyft to test speed

  // Send subscription to the websocket once the connection is open
  ws.on("open", () => {
    // Unsubscribe
    if (ws && !init) sendUnsubscribeRequest(ws); // Send a request once the WebSocket is open
    // Subscribe
    if (ws) sendSubscribeRequest(ws); // Send a request once the WebSocket is open
    console.log("\n🔓 WebSocket is open and listening.");
    init = true;
  });

  // Logic for the message event for the .on event listener
  ws.on("message", async (data: WebSocket.Data) => {
    try {
      const jsonString = data.toString(); // Convert data to a string
      const parsedData = JSON.parse(jsonString); // Parse the JSON string

      // Safely access the nested structure
      const logs = parsedData?.params?.result?.value?.logs;
      const signature = parsedData?.params?.result?.value?.signature;

      // Validate `logs` is an array
      if (Array.isArray(logs)) {
        // Verify if this is a new pool creation
        const containsCreate = logs.some((log: string) => typeof log === "string" && log.includes("Program log: initialize2: InitializeInstruction2"));
        if (!containsCreate || typeof signature !== "string") return;

        // Verify if we have reached the max concurrent transactions
        if (activeTransactions >= MAX_CONCURRENT) {
          console.log("⏳ Max concurrent transactions reached, skipping...");
          return;
        }

        // Add additional concurrent transaction
        activeTransactions++;

        if (config.rug_check.verbose_log) {
          console.log(jsonString)
        }

        // Process transaction asynchronously
        processTransaction(signature)
          .catch((error) => {
            console.error("Error processing transaction:", error);
          })
          .finally(() => {
            activeTransactions--;
          });
      }
    } catch (error) {
      console.error("Error parsing JSON or processing data:", error);
    }
  });

  ws.on("error", (err: Error) => {
    console.error("WebSocket error:", err);
  });

  ws.on("close", () => {
    // Connection closed, discard old websocket and create a new one in 5 seconds
    ws = null;
    setTimeout(websocketHandler, 5000);
  });
}

websocketHandler();
