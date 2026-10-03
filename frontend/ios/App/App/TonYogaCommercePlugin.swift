import Foundation
import UIKit
import StoreKit
import Capacitor

/// StoreKit 2 bridge. The server is authoritative for delivery; never finish before verification.
@objc(TonYogaCommercePlugin)
public final class TonYogaCommercePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TonYogaCommercePlugin"
    public let jsName = "TonYogaCommerce"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise)
    ]
    private var updates: Task<Void, Never>?
    private var observer: NSObjectProtocol?

    public override func load() {
        observer = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("appActive", data: [:])
        }
        updates = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                if Task.isCancelled { break }
                // Only locally verified StoreKit transactions are exposed. Server verification follows.
                if case .verified(let transaction) = result {
                    self?.notifyListeners("transactionUpdated", data: ["transactionId": String(transaction.id)])
                }
            }
        }
    }
    deinit {
        updates?.cancel()
        if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    }
    private func typeName(_ type: Product.ProductType) -> String {
        switch type {
        case .consumable: return "consumable"
        case .nonConsumable: return "nonConsumable"
        case .nonRenewable: return "nonRenewable"
        case .autoRenewable: return "autoRenewable"
        default: return "unknown"
        }
    }
    private func periodLabel(_ product: Product) -> String {
        guard let period = product.subscription?.subscriptionPeriod else { return "" }
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "period"
        }
        return "every \(period.value) \(unit)\(period.value == 1 ? "" : "s")"
    }
    private func resultData(_ result: VerificationResult<Transaction>) -> [String: Any]? {
        guard case .verified(let transaction) = result else { return nil }
        return ["status": "success", "jws": result.jwsRepresentation,
                "transactionId": String(transaction.id), "productId": transaction.productID]
    }
    @objc func products(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self), !ids.isEmpty, ids.count <= 100 else {
            call.reject("Supply between 1 and 100 product identifiers."); return
        }
        Task { @MainActor in
            do {
                let products = try await Product.products(for: ids)
                let values: [[String: Any]] = products.map {
                    ["id": $0.id, "displayName": $0.displayName, "description": $0.description,
                     "displayPrice": $0.displayPrice, "type": self.typeName($0.type),
                     "periodLabel": self.periodLabel($0)]
                }
                call.resolve(["products": values])
            } catch { call.reject("The App Store could not load products. Please try again.", "PRODUCTS_UNAVAILABLE", error) }
        }
    }
    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("productId"),
              let value = call.getString("appAccountToken"), let token = UUID(uuidString: value) else {
            call.reject("A server-issued purchase token is required."); return
        }
        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("This product is not available in the App Store."); return
                }
                guard AppStore.canMakePayments else { call.reject("Purchases are disabled on this device."); return }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verified):
                    guard let data = self.resultData(verified) else {
                        call.reject("Apple could not verify this purchase.", "UNVERIFIED_TRANSACTION"); return
                    }
                    // Deliberately not calling transaction.finish(). JavaScript verifies with the VPS first.
                    call.resolve(data)
                case .pending: call.resolve(["status": "pending"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.reject("Unexpected App Store purchase state.")
                }
            } catch { call.reject("Purchase could not be completed. Please try again.", "PURCHASE_FAILED", error) }
        }
    }
    @objc func pendingTransactions(_ call: CAPPluginCall) {
        Task { @MainActor in
            var values: [[String: Any]] = []
            for await result in Transaction.unfinished {
                if let value = self.resultData(result) { values.append(value) }
                if values.count >= 500 { break }
            }
            call.resolve(["transactions": values])
        }
    }
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await AppStore.sync() // Only from the explicit Restore button; may prompt Apple authentication.
                var values: [[String: Any]] = []
                var seen = Set<String>()
                for await result in Transaction.unfinished {
                    if let value = self.resultData(result), let id = value["transactionId"] as? String, seen.insert(id).inserted { values.append(value) }
                }
                for await result in Transaction.all {
                    if let value = self.resultData(result), let id = value["transactionId"] as? String, seen.insert(id).inserted { values.append(value) }
                    if values.count >= 500 { break }
                }
                call.resolve(["transactions": values, "truncated": values.count >= 500])
            } catch { call.reject("Unable to restore App Store purchases.", "RESTORE_FAILED", error) }
        }
    }
    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId") else { call.reject("transactionId is required."); return }
        Task { @MainActor in
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, String(transaction.id) == id {
                    await transaction.finish()
                    call.resolve(); return
                }
            }
            call.resolve() // Already finished is idempotent.
        }
    }
    @objc func openExternal(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              url.user == nil, url.password == nil, let host = url.host?.lowercased() else {
            call.reject("Only secure, approved HTTPS destinations can open."); return
        }
        let allowed = ["tonyoga.com", "www.tonyoga.com", "www.paypal.com", "paypal.com",
                       "www.sandbox.paypal.com", "sandbox.paypal.com", "checkout.stripe.com",
                       "apps.apple.com", "amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr",
                       "amazon.es", "amazon.it", "amazon.in", "amazon.ca", "amazon.com.au",
                       "amazon.co.jp", "amazon.nl", "amazon.se", "amazon.pl", "amazon.com.be"]
        let isAllowed = allowed.contains(host) || allowed.filter { $0.hasPrefix("amazon.") }.contains { host == "www." + $0 }
        guard isAllowed else { call.reject("This checkout destination is not approved."); return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve(["opened": true]) } else { call.reject("The browser could not be opened.") }
            }
        }
    }
}

@objc(TonYogaViewController)
final class TonYogaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TonYogaCommercePlugin())
    }
}
