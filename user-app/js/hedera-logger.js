// In a production app, these keys live on a secure backend server.
// For this frontend-only MVP prototype, we initialize them here.
const LGU_OPERATOR_ID = "0.0.9399649";
const LGU_PRIVATE_KEY = "302e020100300506032b657004220420b1f6201277c5fa12acb2b5247cbe027fa52e236fd66801bfbf9307fbfe9334a5";
const E_TAPON_TOPIC_ID = "0.0.9783811";

/**
 * Hashes and submits report metadata to the Hedera ledger
 * @param {Object} reportPayload - The validated report data
 * @returns {Promise<string|null>} The HashScan Transaction URL
 */
export async function logReportOnChain(reportPayload) {
    try {
        console.log("Notarizing civic report on Hedera...");

        // LAZY LOAD: Only fetch the heavy SDK when this function is actually called
        const Hedera = await import('https://esm.sh/@hashgraph/sdk');
        const { Client, TopicMessageSubmitTransaction, PrivateKey } = Hedera;

        const client = Client.forTestnet();
        client.setOperator(LGU_OPERATOR_ID, PrivateKey.fromString(LGU_PRIVATE_KEY));

        // 1. Create a lightweight stringified payload. 
        // ADDED: The 'status' field so HashScan shows the exact state of the report
        const auditData = JSON.stringify({
            app: "E-Tapon-Mo",
            status: reportPayload.statusUpdate || "pending", // <--- THE MISSING PIECE
            severity: reportPayload.aiSeverityScore,
            category: reportPayload.category,
            lat: reportPayload.lat,
            lng: reportPayload.lng,
            timestamp: new Date().toISOString()
        });

        // 2. Construct the HCS Message Transaction
        const transaction = new TopicMessageSubmitTransaction()
            .setTopicId(E_TAPON_TOPIC_ID)
            .setMessage(auditData);

        // 3. Execute and grab the receipt
        const txResponse = await transaction.execute(client);
        const receipt = await txResponse.getReceipt(client);

        if (receipt.status.toString() === "SUCCESS") {
            const txIdStr = txResponse.transactionId.toString();

            // Split into ["0.0.9399649", "1785130050.654243810"]
            const [accountId, timestamp] = txIdStr.split('@');

            // Format to HashScan standard: 0.0.9399649-1785130050-654243810
            const formattedTxId = `${accountId}-${timestamp.replace('.', '-')}`;

            const hashScanUrl = `https://hashscan.io/testnet/transaction/${formattedTxId}`;
            console.log("Blockchain Sync Complete:", hashScanUrl);
            return hashScanUrl;
        }
        return null;

    } catch (error) {
        console.error("Hedera HCS Failure:", error);
        return null; // Fallback so the app doesn't crash if the network hiccups
    }
}