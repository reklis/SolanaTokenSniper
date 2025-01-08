import axios from "axios";
import { config } from "../config";

async function getPrice(token: string, retryCount = 0) {
  if (retryCount > 5) {
    console.log("⛔ Latest price could not be fetched. Giving up.");
    return 0;
  }

  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";

  const priceResponse = await axios.get<any>(priceUrl, {
    params: {
      ids: token,
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

  const tokenCurrentPrice = currentPrices[token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;

  return tokenCurrentPrice;
}

export { getPrice };
