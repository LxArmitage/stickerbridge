import ExpoModulesCore
import UIKit

/// Entrega un pack de stickers a WhatsApp en iPhone.
///
/// Es el mismo mecanismo que el ejemplo oficial de WhatsApp
/// (github.com/WhatsApp/stickers, iOS/WAStickersThirdParty/Interoperability.swift):
/// el JSON del pack va al portapapeles bajo un tipo propio de WhatsApp y luego
/// se abre whatsapp://stickerPack, que lo lee de ahí. El JSON ya viene armado
/// del servidor (imágenes en base64), así que aquí no se procesa nada.
public class WhatsAppStickersModule: Module {
  private static let pasteboardType = "net.whatsapp.third-party.sticker-pack"
  private static let stickerPackURL = URL(string: "whatsapp://stickerPack")!
  private static let whatsAppURL = URL(string: "whatsapp://")!
  /// Lo mismo que el ejemplo: el pack no se queda en el portapapeles.
  private static let pasteboardExpiration: TimeInterval = 60

  public func definition() -> ModuleDefinition {
    Name("WhatsAppStickers")

    AsyncFunction("isWhatsAppInstalled") { () -> Bool in
      // Requiere "whatsapp" en LSApplicationQueriesSchemes (app.json).
      return UIApplication.shared.canOpenURL(Self.whatsAppURL)
    }.runOnQueue(.main)

    AsyncFunction("sendStickerPack") { (json: String) in
      guard let data = json.data(using: .utf8) else {
        throw InvalidPackException()
      }
      guard UIApplication.shared.canOpenURL(Self.whatsAppURL) else {
        throw WhatsAppNotInstalledException()
      }
      UIPasteboard.general.setItems(
        [[Self.pasteboardType: data]],
        options: [
          .localOnly: true,
          .expirationDate: Date(timeIntervalSinceNow: Self.pasteboardExpiration),
        ]
      )
      UIApplication.shared.open(Self.stickerPackURL, options: [:], completionHandler: nil)
    }.runOnQueue(.main)
  }
}

final class WhatsAppNotInstalledException: Exception {
  override var reason: String {
    "WhatsApp no está instalado en este iPhone."
  }
}

final class InvalidPackException: Exception {
  override var reason: String {
    "Los datos del pack no son válidos."
  }
}
