import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = nil
        }

        let message: Any?
        if #available(iOS 15.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = nil
        }

        os_log(.default, "Ch3ssClient: received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["ok": true]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
