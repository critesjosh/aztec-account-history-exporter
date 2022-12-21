import "./App.css";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  AztecSdk,
  createAztecSdk,
  EthersAdapter,
  EthereumProvider,
  SdkFlavour,
  AztecSdkUser,
  GrumpkinAddress,
  SchnorrSigner,
  EthAddress,
  UserPaymentTx,
  UserDefiTx,
  UserAccountTx,
  UserDefiClaimTx,
} from "@aztec/sdk";
import networkConfig from "./network_config.js";

declare var window: any;

const App = () => {
  const [hasMetamask, setHasMetamask] = useState(false);
  const [ethAccount, setEthAccount] = useState<EthAddress | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [initing, setIniting] = useState(false);
  const [sdk, setSdk] = useState<null | AztecSdk>(null);
  const [account0, setAccount0] = useState<AztecSdkUser | null>(null);
  const [userExists, setUserExists] = useState<boolean>(false);
  const [accountPrivateKey, setAccountPrivateKey] = useState<Buffer | null>(
    null
  );
  const [accountPublicKey, setAccountPublicKey] =
    useState<GrumpkinAddress | null>(null);
  const [spendingSigner, setSpendingSigner] = useState<
    SchnorrSigner | undefined
  >(undefined);

  // Metamask Check
  useEffect(() => {
    if (window.ethereum) {
      setHasMetamask(true);
    }
    window.ethereum.on("accountsChanged", () => window.location.reload());
  }, []);

  async function connect() {
    try {
      if (window.ethereum) {
        setIniting(true); // Start init status

        // Get Metamask provider
        // TODO: Show error if Metamask is not on Aztec Testnet
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const ethereumProvider: EthereumProvider = new EthersAdapter(provider);

        // Get Metamask ethAccount
        await provider.send("eth_requestAccounts", []);
        const mmSigner = provider.getSigner();
        const mmAddress = EthAddress.fromString(await mmSigner.getAddress());
        setEthAccount(mmAddress);

        let chainId = parseInt(
          await ethereumProvider.request({
            method: "eth_chainId",
          }),
          16
        );
        setChainId(chainId);

        // Initialize SDK
        const sdk = await createAztecSdk(ethereumProvider, {
          serverUrl: networkConfig[chainId].rollupProvider,
          pollInterval: 1000,
          // memoryDb: true,
          debug: "bb:*",
          flavour: SdkFlavour.PLAIN,
          minConfirmation: 1, // ETH block confirmations
        });
        await sdk.run();
        await sdk.awaitSynchronised();
        console.log("Aztec SDK initialized:", sdk);
        setSdk(sdk);

        // Generate user's privacy keypair
        // The privacy keypair (also known as account keypair) is used for en-/de-crypting values of the user's spendable funds (i.e. balance) on Aztec
        // It can but is not typically used for receiving/spending funds, as the user should be able to share viewing access to his/her Aztec account via sharing his/her privacy private key
        const { publicKey: accPubKey, privateKey: accPriKey } =
          await sdk.generateAccountKeyPair(mmAddress);
        console.log("Public Key:", accPubKey.toString());
        setAccountPrivateKey(accPriKey);
        setAccountPublicKey(accPubKey);
        if (await sdk.isAccountRegistered(accPubKey)) setUserExists(true);

        // Get or generate Aztec SDK local user
        let account0 = (await sdk.userExists(accPubKey))
          ? await sdk.getUser(accPubKey)
          : await sdk.addUser(accPriKey);
        await sdk.awaitUserSynchronised(account0.id);
        setAccount0(account0);

        setIniting(false); // End init status
      }
    } catch (e) {
      console.log(e);
    }
  }

  async function getHistory() {
    let txs = await sdk!.getUserTxs(accountPublicKey!);
    let rows = [
      [
        "Ethereum account",
        "Aztec userId",
        "txId",
        "created",
        "settled",
        "Tx Type",
        "AssetId",
        "Value",
        "Fee",
        "Sender?"
      ],
    ];
    txs.map((tx) => {
      let txType = "",
        value = "",
        assetId = "",
        isSender = "",
        fee = "";
      switch (tx.proofId) {
        case 1:
          txType = "Deposit";
          break;
        case 2:
          txType = "Withdrawal";
          break;
        case 3:
          txType = "Send";
          break;
        case 4:
          txType = "Account";
          break;
        case 5:
          txType = "Defi Deposit";
          break;
        case 6:
          txType = "Defi Claim";
          break;
      }
      if (tx instanceof UserPaymentTx) {
        value = tx.value.value.toString();
        assetId = tx.value.assetId.toString();
        fee = tx.fee.value.toString();
        isSender = tx.isSender.toString();
      }
      if (tx instanceof UserDefiTx || tx instanceof UserDefiClaimTx) {
        value = tx.depositValue.value.toString();
        assetId = tx.depositValue.assetId.toString();
      }
      rows.push([
        ethAccount!.toString(),
        tx.userId.toString(),
        tx.txId!.toString(),
        tx.created!.toDateString(),
        tx.settled!.toDateString(),
        txType,
        assetId,
        value,
        fee,
        isSender,
      ]);
    });
    let csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    var encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
  }

  return (
    <div className="App">
      <h1>Aztec Account History Exporter Tool</h1>
      <p>
        View the source code{" "}
        <a
          target="_blank"
          href="https://github.com/AztecProtocol/aztec-frontend-boilerplate/tree/jc/history-export"
        >
          here.
        </a>
      </p>
      {hasMetamask ? (
        sdk ? (
          <div></div>
        ) : (
          <button onClick={() => connect()}>Connect Metamask</button>
        )
      ) : (
        // TODO: Fix rendering of this. Not rendered, reason unknown.
        "Metamask is not detected. Please make sure it is installed and enabled."
      )}
      {initing ? (
        <p>
          Initializing... This can take some time.
          <br />
          <br />
          You can right click on the page, click "Inspect" and navigate to the
          "Console" tab to track progress.
        </p>
      ) : (
        ""
      )}
      {account0 ? (
        <button onClick={() => getHistory()}>
          Download transaction history
        </button>
      ) : (
        ""
      )}
    </div>
  );
};

export default App;
