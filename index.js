import { privateKey } from "./accounts/accounts.js";
import { Config } from "./config/config.js";
import Core from "./src/core/core.js";
import sqlite from "./src/core/db/sqlite.js";
import { RPC } from "./src/core/network/rpc.js";
import { Helper } from "./src/utils/helper.js";
import logger from "./src/utils/logger.js";
import twist from "./src/utils/twist.js";

async function operation(acc) {
  await sqlite.connectToDatabase();
  await sqlite.createTable();
  const core = new Core(acc);
  try {
    await core.connectWallet();
    await core.getBalance();

    if (core.balance.ETH < 0.01)
      throw Error(`Minimum Balance is 0.01 ${RPC.SYMBOL}`);

    if (core.balance.WETH > 0) await core.clearWeth();
    if (core.balance.USDT > 0) {
      await core.clearUsdt();
      const delay = 60000 * 10;
      await Helper.delay(
        delay,
        acc,
        `Delaying for ${Helper.msToTime(delay)} Before Executing Next Swap`,
        core
      );
    }

    await core.checkIn();
    const dailyTx = Config.SWAPCOUNT;
    let currentTx = (await sqlite.getTodayTxLog(core.address, "SWAP")).length;

    while (currentTx < dailyTx) {
      await core.swap();
      currentTx = (await sqlite.getTodayTxLog(core.address, "SWAP")).length;
      const delay = 60000 * 10;
      await Helper.delay(
        delay,
        acc,
        `Delaying for ${Helper.msToTime(delay)} Before Executing Next Swap`,
        core
      );
    }

    if (core.balance.WETH > 0) await core.clearWeth();
    if (core.balance.USDT > 0) await core.clearUsdt();

    const delay = 60000 * 60 * 24;
    await Helper.delay(
      delay,
      acc,
      `Account ${
        privateKey.indexOf(acc) + 1
      } Processing Done, Delaying for ${Helper.msToTime(delay)}`,
      core
    );
    await operation(acc);
  } catch (error) {
    if (error.message) {
      await Helper.delay(
        10000,
        acc,
        `Error : ${error.message}, Retry again after 10 Second`,
        core
      );
    } else {
      await Helper.delay(
        10000,
        acc,
        `Error :${JSON.stringify(error)}, Retry again after 10 Second`,
        core
      );
    }

    await operation(acc);
  }
}

async function startBot() {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`BOT STARTED`);
      if (privateKey.length == 0)
        throw Error("Please input your account first on accounts.js file");
      const promiseList = [];

      for (const acc of privateKey) {
        promiseList.push(operation(acc));
      }

      await Promise.all(promiseList);
      resolve();
    } catch (error) {
      logger.info(`BOT STOPPED`);
      logger.error(JSON.stringify(error));
      reject(error);
    }
  });
}

(async () => {
  try {
    logger.clear();
    logger.info("");
    logger.info("Application Started");
    Helper.showSkelLogo();
    console.log("INITVERSE TX BOT");
    console.log("By : Widiskel");
    console.log("Follow On : https://github.com/Widiskel");
    console.log("Join Channel : https://t.me/skeldrophunt");
    console.log("Dont forget to run git pull to keep up to date");
    await startBot();
  } catch (error) {
    twist.clear();
    twist.clearInfo();
    console.log("Error During executing bot", error);
    await startBot();
  }
})();
