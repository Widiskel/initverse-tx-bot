export class Config {
  static GWEIPRICE = 1.5;
  static WAITFORBLOCKCONFIRMATION = true;

  static TXAMOUNT = 0.1;

  static USEWRAPUNWRAP = true;
  static WRAPUNWRAPCOUNT = 10;
  static WETHCONTRACTADDRESS = "0xfbecae21c91446f9c7b87e4e5869926998f99ffe";

  static USESELFTRANSFER = true;
  static SELFTRANSFERCOUNT = 10;
  static CONTRACTADDRESS = undefined;

  static RPC = {
    CHAINID: 7234, //CHAIN ID EX: 123123
    RPCURL: "https://rpc-testnet.inichain.com", //RPC URL EX : "https://xxx"
    EXPLORER: "https://genesis-testnet.iniscan.com/", //BLOCK EXPLORER EX "https://explorer"
    SYMBOL: "INI",
  };
}
