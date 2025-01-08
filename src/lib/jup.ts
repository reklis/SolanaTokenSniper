import axios from "axios";
import { config } from "../config";

export async function getPrice(token: string[], retryCount = 0) {
  if (retryCount > 5) {
    console.log("⛔ Latest price could not be fetched. Giving up.");
    return 0;
  }

  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";

  const priceResponse = await axios.get<any>(priceUrl, {
    params: {
      ids: token.join(","),
      showExtraInfo: true,
    },
    timeout: config.tx.get_timeout,
  });

  const currentPrices = priceResponse.data.data;
  if (!currentPrices) {
    console.log("⛔ Latest price could not be fetched. Trying again...");

    // exponential backoff
    await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
    return getPrice(token, retryCount + 1);
  }

  return currentPrices;
}

export async function getBuyQuote(token: string, amount: string) {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const quoteResponse = await axios.get<any>(quoteUrl, {
    params: {
      inputMint: config.liquidity_pool.wsol_pc_mint,
      outputMint: token,
      amount: amount,
    }
  });

  return quoteResponse.data;
}
