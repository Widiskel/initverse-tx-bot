import { ethers } from "ethers";
import { privateKey } from "../../accounts/accounts.js";
import { Helper } from "../utils/helper.js";
import logger from "../utils/logger.js";
import { RPC } from "./network/rpc.js";
import { Config } from "../../config/config.js";
import { DEPLOYEDTOKEN } from "./contract/deployed_token.js";
import { API } from "../api/api.js";
import { CHECKINCONTRACT } from "./contract/checkin.js";
import sqlite from "./db/sqlite.js";
import { TOKENLIST } from "./contract/erc20_token_list.js";
import { UNISWAPV2ROUTER } from "./contract/uniswapv2_router.js";

export default class Core extends API {
  constructor(acc) {
    super();
    this.acc = acc;
    this.provider = new ethers.JsonRpcProvider(RPC.RPCURL, RPC.CHAINID);
  }

  async connectWallet() {
    try {
      const data = this.acc;
      const accIdx = privateKey.indexOf(this.acc);
      await Helper.delay(
        1000,
        this.acc,
        `Connecting to Account : ${accIdx + 1}`,
        this
      );
      const type = Helper.determineType(data);
      logger.info(`Account Type : ${type}`);
      if (type == "Secret Phrase") {
        /**
         * @type {Wallet}
         */
        this.wallet = new ethers.Wallet.fromPhrase(data, this.provider);
      } else if (type == "Private Key") {
        /**
         * @type {Wallet}
         */
        this.wallet = new ethers.Wallet(data.trim(), this.provider);
      } else {
        throw Error("Invalid account Secret Phrase or Private Key");
      }
      this.address = this.wallet.address;
      await Helper.delay(
        1000,
        this.acc,
        `Wallet connected ${JSON.stringify(this.wallet.address)}`,
        this
      );
    } catch (error) {
      throw error;
    }
  }

  async getBalance(update = false) {
    try {
      if (!update) {
        await Helper.delay(
          500,
          this.acc,
          `Getting Wallet Balance of ${this.wallet.address}`,
          this
        );
      }

      const ethBalance = ethers.formatEther(
        await this.provider.getBalance(this.wallet.address)
      );

      const wethContract = new ethers.Contract(
        TOKENLIST.WETH,
        TOKENLIST.ABI,
        this.provider
      );
      const wethBalance = ethers.formatEther(
        await wethContract.balanceOf(this.address)
      );
      this.wethSymbol = await wethContract.symbol();

      const usdtContract = new ethers.Contract(
        TOKENLIST.USDT,
        TOKENLIST.ABI,
        this.provider
      );
      const usdtBalance = ethers.formatEther(
        await usdtContract.balanceOf(this.address)
      );
      this.usdtSymbol = await usdtContract.symbol();

      this.balance = {
        ETH: ethBalance,
        WETH: wethContract ? wethBalance : "-",
        USDT: usdtContract ? usdtBalance : "-",
      };
      await Helper.delay(500, this.acc, `Balance updated`, this);
    } catch (error) {
      throw error;
    }
  }

  async deposit() {
    try {
      await Helper.delay(
        500,
        this.acc,
        `Try To Wrap ${RPC.SYMBOL} to ${this.wethSymbol}`,
        this
      );

      const wethContract = new ethers.Contract(
        TOKENLIST.WETH,
        TOKENLIST.ABI,
        this.wallet
      );
      const amountInWei = ethers.parseEther("0.1");
      const data = wethContract.interface.encodeFunctionData("deposit");
      const nonce = await this.getOptimalNonce();
      const gasLimit = await this.estimateGasWithRetry(
        TOKENLIST.WETH,
        amountInWei,
        data,
        3,
        1000
      );

      const tx = {
        to: TOKENLIST.WETH,
        value: amountInWei,
        gasLimit,
        gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        nonce: nonce,
        data: data,
      };

      await this.executeTx(tx);
    } catch (error) {
      throw error;
    }
  }
  async withdraw() {
    try {
      await Helper.delay(
        500,
        this.acc,
        `Trying to Unwrap ${this.wethSymbol} to ${RPC.SYMBOL}`,
        this
      );

      const wethContract = new ethers.Contract(
        TOKENLIST.WETH,
        TOKENLIST.ABI,
        this.wallet
      );
      const wethBalance = await wethContract.balanceOf(this.wallet.address);
      const amountInWei = wethBalance;
      const amountInEth = ethers.formatEther(amountInWei);
      logger.info(`Unwrapping ${amountInEth} WETH To ETH`);

      const data = wethContract.interface.encodeFunctionData("withdraw", [
        amountInWei,
      ]);

      const nonce = await this.getOptimalNonce();
      const gasLimit = await this.estimateGasWithRetry(
        TOKENLIST.WETH,
        0,
        data,
        3,
        1000
      );

      const tx = {
        to: TOKENLIST.WETH,
        value: 0,
        gasLimit,
        gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        nonce: nonce,
        data: data,
      };

      await this.executeTx(tx);
    } catch (error) {
      throw error;
    }
  }

  async rawTx() {
    try {
      await Helper.delay(
        500,
        this.acc,
        `Try To Executing RAW Transaction`,
        this
      );

      const amountInWei = ethers.parseEther("0.1");
      const data = Config.RAWTX.RAWDATA;
      const nonce = await this.getOptimalNonce();
      const gasLimit = await this.estimateGasWithRetry(
        Config.RAWTX.CONTRACTTOINTERACT,
        amountInWei,
        data,
        3,
        1000
      );

      const tx = {
        to: Config.RAWTX.CONTRACTTOINTERACT,
        value: amountInWei,
        gasLimit,
        gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        nonce: nonce,
        data: data,
      };

      await this.executeTx(tx);
    } catch (error) {
      throw error;
    }
  }

  async transfer() {
    const amount = Helper.randomFloat(Config.TXAMOUNTMIN, Config.TXAMOUNTMAX);
    try {
      await Helper.delay(
        1000,
        this.acc,
        `Trying to transfer ${amount}${RPC.SYMBOL} to ${this.address}`,
        this
      );
      const nonce = await this.getOptimalNonce();

      let tx;
      if (DEPLOYEDTOKEN.WETH) {
        const tokenContract = new ethers.Contract(
          DEPLOYEDTOKEN.WETH,
          DEPLOYEDTOKEN.ABI,
          this.wallet
        );
        const allowance = await tokenContract.allowance(
          this.address,
          DEPLOYEDTOKEN.WETH
        );
        if (allowance == 0) {
          await Helper.delay(1000, this.acc, `Approving Token Spend`, this);
          const approval = await tokenContract.approve(
            DEPLOYEDTOKEN.WETH,
            ethers.MaxUint256
          );
          await approval.wait();
          await Helper.delay(1000, this.acc, `Token Approved`, this);
        }
        const data = await tokenContract.transfer.populateTransaction(
          this.address,
          ethers.parseEther(amount.toString())
        );
        const gasLimit = await this.estimateGasWithRetry(
          data.to,
          0,
          data.data,
          3,
          1000
        );

        tx = {
          to: data.to,
          nonce,
          data: data.data,
          gasLimit,
          gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        };
      } else {
        const fee = await this.provider.estimateGas({
          to: this.address,
        });
        tx = {
          to: this.address,
          value: ethers.parseEther(amount.toString()),
          nonce,
          gasLimit: fee,
          gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
        };
      }

      await this.executeTx(tx);
    } catch (error) {
      throw error;
    }
  }

  async executeTx(tx) {
    try {
      logger.info(`TX DATA ${JSON.stringify(Helper.serializeBigInt(tx))}`);
      await Helper.delay(500, this.acc, `Executing TX...`, this);
      const txRes = await this.wallet.sendTransaction(tx);
      // console.log(txRes);
      if (Config.WAITFORBLOCKCONFIRMATION) {
        logger.info(`Tx Executed \n${RPC.EXPLORER}tx/${txRes.hash}`);
        await Helper.delay(
          500,
          this.acc,
          `Tx Executed Waiting For Block Confirmation...`,
          this
        );
        const txRev = await txRes.wait();
        logger.info(`Tx Confirmed and Finalizing: ${JSON.stringify(txRev)}`);
        await Helper.delay(
          5000,
          this.acc,
          `Tx Executed and Confirmed \n${RPC.EXPLORER}tx/${txRev.hash}`,
          this
        );
      } else {
        await Helper.delay(500, this.acc, `Tx Executed...`, this);
        await Helper.delay(
          5000,
          this.acc,
          `Tx Executed \n${RPC.EXPLORER}tx/${txRes.hash}`,
          this
        );
      }

      await this.getBalance(true);
    } catch (error) {
      if (error.message.includes("504")) {
        await Helper.delay(5000, this.acc, error.message, this);
      } else {
        throw error;
      }
    }
  }

  async getOptimalNonce() {
    try {
      const latestNonce = await this.provider.getTransactionCount(
        this.wallet.address,
        "latest"
      );
      const pendingNonce = await this.provider.getTransactionCount(
        this.wallet.address,
        "pending"
      );
      const optimalNonce =
        pendingNonce > latestNonce ? pendingNonce : latestNonce;
      return optimalNonce;
    } catch (error) {
      throw error;
    }
  }

  async estimateGasWithRetry(
    address,
    amount,
    rawdata,
    directThrow = false,
    retries = 3,
    delay = 3000
  ) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        logger.info(`Estimating Gas for ${rawdata} TX`);
        const gasLimit = await this.provider.estimateGas({
          from: this.wallet.address,
          to: address,
          value: amount,
          data: rawdata,
        });
        // console.log(gasLimit);
        return gasLimit;
      } catch (err) {
        if (directThrow) {
          throw err;
        } else {
          await Helper.delay(
            delay,
            this.acc,
            `${err.reason}... Attempt ${attempt + 1} of ${retries}`,
            this
          );

          if (attempt === retries - 1) {
            throw Error(`Failed to estimate gas after ${retries} attempts.`);
          }
        }
      }
    }
  }

  async buildTxBody(data, direct = false, value = 0) {
    const nonce = await this.getOptimalNonce();
    const gasLimit = await this.estimateGasWithRetry(
      data.to,
      value,
      data.data,
      direct
    );
    const tx = {
      to: data.to,
      from: this.address,
      value: value,
      gasLimit,
      gasPrice: ethers.parseUnits(Config.GWEIPRICE.toString(), "gwei"),
      nonce: nonce,
      data: data.data,
    };
    return tx;
  }

  async checkIn() {
    try {
      await Helper.delay(500, this.acc, `Trying to check In...`, this);
      const contract = new ethers.Contract(
        CHECKINCONTRACT.CONTRACTADDRESS,
        CHECKINCONTRACT.ABI,
        this.wallet
      );
      const rawData = await contract.checkIn.populateTransaction();

      const tx = await this.buildTxBody(rawData, true);
      await this.executeTx(tx);
    } catch (error) {
      if (error.reason.includes("check-in")) {
        await Helper.delay(3000, this.acc, error.reason, this);
      } else {
        throw error;
      }
    }
  }

  async calculateSwapOutput(router, amount, path) {
    const data = await router.getAmountsOut(amount, path);
    const result = data[1] - (data[1] % 10n ** 14n);

    return result;
  }
  async swap() {
    try {
      await Helper.delay(
        0,
        this.acc,
        `Swapping ${Config.TXAMOUNT} ${RPC.SYMBOL} to ? USDT...`,
        this
      );
      const swapAmount = ethers.parseUnits(Config.TXAMOUNT.toString(), 18);
      const router = new ethers.Contract(
        UNISWAPV2ROUTER.CONTRACTADDRESS,
        UNISWAPV2ROUTER.ABI,
        this.wallet
      );
      const swapPath = [TOKENLIST.WETH, TOKENLIST.USDT];
      const output = await this.calculateSwapOutput(
        router,
        swapAmount,
        swapPath
      );
      await Helper.delay(
        1000,
        this.acc,
        `Swapping ${Config.TXAMOUNT} ${RPC.SYMBOL} to ${ethers.formatEther(
          output
        )} USDT...`,
        this
      );
      const rawData = await router.swapExactETHForTokens.populateTransaction(
        output,
        swapPath,
        this.address,
        BigInt(Math.floor(Date.now() / 1000) + 60 * 20)
      );
      const tx = await this.buildTxBody(rawData, true, swapAmount);
      await this.executeTx(tx);
      await sqlite.insertData(this.address, new Date().toISOString(), "SWAP");
      await Helper.delay(
        1000,
        this.acc,
        `Successfully Swap ${Config.TXAMOUNT} ${
          RPC.SYMBOL
        } to ${ethers.formatEther(output)} USDT`,
        this
      );

      if (
        (await sqlite.isSpenderExists(this.address, TOKENLIST.USDT)) == false
      ) {
        await Helper.delay(
          500,
          this.acc,
          `Try to Approving USDT Token spend`,
          this
        );
        const usdtContract = new ethers.Contract(
          TOKENLIST.USDT,
          TOKENLIST.ABI,
          this.wallet
        );
        const approveTx = await usdtContract.approve(
          UNISWAPV2ROUTER.CONTRACTADDRESS,
          ethers.MaxUint256
        );
        await approveTx.wait();
        await Helper.delay(500, this.acc, `Approved USDT token spend`, this);
        await sqlite.insertApprovalData(this.address, TOKENLIST.USDT);
      } else {
        await Helper.delay(500, this.acc, `USDT Approval Found`, this);
      }

      const delay = 60000 * 10;
      await Helper.delay(
        delay,
        this.acc,
        `Delaying for ${Helper.msToTime(delay)} Before Swapping Back`,
        this
      );
      await Helper.delay(
        0,
        this.acc,
        `Swapping back ${ethers.formatEther(output)} USDT to ? ${
          RPC.SYMBOL
        }...`,
        this
      );
      const output2 = await this.calculateSwapOutput(
        router,
        output,
        swapPath.reverse()
      );
      await Helper.delay(
        1000,
        this.acc,
        `Swapping back ${ethers.formatEther(
          output
        )} USDT to ${ethers.formatEther(output2)} ${RPC.SYMBOL}...`,
        this
      );

      const rawData2 = await contract.swapExactTokensForETH.populateTransaction(
        output,
        output2,
        swapPath.reverse(),
        this.wallet.address,
        BigInt(Math.floor(Date.now() / 1000) + 60 * 30)
      );
      // console.log(rawData);
      const tx2 = await this.buildTxBody(rawData2, true);
      await this.executeTx(tx2);
      await sqlite.insertData(this.address, new Date().toISOString(), "SWAP");
      await this.getBalance();
      await Helper.delay(
        1000,
        this.acc,
        `Successfully Swap back ${ethers.formatEther(
          output
        )} USDT to ${ethers.formatEther(output2)} ${RPC.SYMBOL}...`,
        this
      );
    } catch (error) {
      throw error;
    }
  }

  async clearWeth() {
    await Helper.delay(
      1000,
      this.acc,
      `Swapping all ${this.wethSymbol} to ${RPC.SYMBOL}`,
      this
    );
    const contract = new ethers.Contract(
      TOKENLIST.WETH,
      TOKENLIST.ABI,
      this.wallet
    );
    const balance = await contract.balanceOf(this.wallet.address);

    const rawData = await contract.withdraw.populateTransaction(balance);
    const tx = await this.buildTxBody(rawData, true);
    await this.executeTx(tx);
    await this.getBalance();
    await Helper.delay(
      1000,
      this.acc,
      `Successfully Swap All ${this.wethSymbol} to ${RPC.SYMBOL}`,
      this
    );
  }
  async clearUsdt() {
    await Helper.delay(
      1000,
      this.acc,
      `Swapping all ${this.usdtSymbol} to ${RPC.SYMBOL}`,
      this
    );
    const contract = new ethers.Contract(
      TOKENLIST.USDT,
      TOKENLIST.ABI,
      this.wallet
    );
    const balance = await contract.balanceOf(this.wallet.address);
    const router = new ethers.Contract(
      UNISWAPV2ROUTER.CONTRACTADDRESS,
      UNISWAPV2ROUTER.ABI,
      this.wallet
    );
    const swapPath = [TOKENLIST.USDT, TOKENLIST.WETH];
    const output = await this.calculateSwapOutput(router, balance, swapPath);

    const rawData = await router.swapExactTokensForETH.populateTransaction(
      balance,
      output,
      swapPath,
      this.address,
      BigInt(Math.floor(Date.now() / 1000) + 60 * 20)
    );
    const tx = await this.buildTxBody(rawData, true);
    await this.executeTx(tx);
    await this.getBalance();
    await sqlite.insertData(this.address, new Date().toISOString(), "SWAP");
    await Helper.delay(
      1000,
      this.acc,
      `Successfully Swap All ${this.usdtSymbol} to ${RPC.SYMBOL}`,
      this
    );
  }
}
