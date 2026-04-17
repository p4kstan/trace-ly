import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Apple } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

interface Props {
  publicKey: string;
  supabaseUrl: string;
}

export function GTMMobileTab({ publicKey, supabaseUrl }: Props) {
  const endpoint = `${supabaseUrl}/functions/v1/gtm-server-events`;

  const androidGradle = `// app/build.gradle (Module)
dependencies {
    implementation 'com.google.android.gms:play-services-tagmanager:18.0.4'
    implementation 'com.google.firebase:firebase-analytics:21.5.0'
}`;

  const androidKotlin = `// MainActivity.kt — Inicialização + envio de eventos
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase
import okhttp3.*
import org.json.JSONObject

class TrackingManager(private val context: Context) {
    private val firebaseAnalytics: FirebaseAnalytics = Firebase.analytics
    private val client = OkHttpClient()
    private val endpoint = "${endpoint}"
    private val apiKey = "${publicKey}"

    fun trackPurchase(orderId: String, value: Double, currency: String = "BRL") {
        // 1. GA4 / Firebase (consumido pelo GTM Mobile container)
        val bundle = Bundle().apply {
            putString(FirebaseAnalytics.Param.TRANSACTION_ID, orderId)
            putDouble(FirebaseAnalytics.Param.VALUE, value)
            putString(FirebaseAnalytics.Param.CURRENCY, currency)
        }
        firebaseAnalytics.logEvent(FirebaseAnalytics.Event.PURCHASE, bundle)

        // 2. CapiTrack (server-side direto)
        sendToCapiTrack("purchase", mapOf(
            "transaction_id" to orderId,
            "value" to value,
            "currency" to currency
        ))
    }

    private fun sendToCapiTrack(eventName: String, params: Map<String, Any>) {
        val payload = JSONObject().apply {
            put("event_name", eventName)
            put("params", JSONObject(params))
            put("client_id", getOrCreateClientId())
        }
        val request = Request.Builder()
            .url(endpoint)
            .header("X-Api-Key", apiKey)
            .post(RequestBody.create(
                MediaType.parse("application/json"),
                payload.toString()
            ))
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { e.printStackTrace() }
            override fun onResponse(call: Call, response: Response) { response.close() }
        })
    }

    private fun getOrCreateClientId(): String {
        val prefs = context.getSharedPreferences("capitrack", Context.MODE_PRIVATE)
        return prefs.getString("cid", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("cid", it).apply()
        }
    }
}`;

  const iosPodfile = `# Podfile
pod 'GoogleTagManager', '~> 7.4'
pod 'Firebase/Analytics'`;

  const iosSwift = `// TrackingManager.swift
import FirebaseAnalytics
import Foundation

class TrackingManager {
    static let shared = TrackingManager()
    private let endpoint = "${endpoint}"
    private let apiKey = "${publicKey}"

    func trackPurchase(orderId: String, value: Double, currency: String = "BRL") {
        // 1. GA4 / Firebase (GTM Mobile container consome)
        Analytics.logEvent(AnalyticsEventPurchase, parameters: [
            AnalyticsParameterTransactionID: orderId,
            AnalyticsParameterValue: value,
            AnalyticsParameterCurrency: currency
        ])

        // 2. CapiTrack server-side
        sendToCapiTrack(eventName: "purchase", params: [
            "transaction_id": orderId,
            "value": value,
            "currency": currency
        ])
    }

    private func sendToCapiTrack(eventName: String, params: [String: Any]) {
        guard let url = URL(string: endpoint) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-Api-Key")

        let payload: [String: Any] = [
            "event_name": eventName,
            "params": params,
            "client_id": getOrCreateClientId()
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        URLSession.shared.dataTask(with: request).resume()
    }

    private func getOrCreateClientId() -> String {
        if let cid = UserDefaults.standard.string(forKey: "capitrack_cid") {
            return cid
        }
        let cid = UUID().uuidString
        UserDefaults.standard.set(cid, forKey: "capitrack_cid")
        return cid
    }
}`;

  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> GTM Mobile (Android + iOS)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Envie eventos do app nativo direto para o CapiTrack via endpoint server-side. Funciona em paralelo com Firebase Analytics
            (GA4) — sem duplicar conversões.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="bg-muted/30 border border-border/30 rounded-lg p-3 text-xs">
              <Badge variant="outline" className="mb-2">Endpoint</Badge>
              <code className="block font-mono break-all">{endpoint}</code>
            </div>
            <div className="bg-muted/30 border border-border/30 rounded-lg p-3 text-xs">
              <Badge variant="outline" className="mb-2">Header obrigatório</Badge>
              <code className="block font-mono">X-Api-Key: {publicKey.substring(0, 16)}...</code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="android" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="android"><Smartphone className="w-4 h-4 mr-1" /> Android (Kotlin)</TabsTrigger>
          <TabsTrigger value="ios"><Apple className="w-4 h-4 mr-1" /> iOS (Swift)</TabsTrigger>
        </TabsList>

        <TabsContent value="android" className="space-y-3 mt-4">
          <Card className="glass-card border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">1. Dependências (Gradle)</CardTitle></CardHeader>
            <CardContent><CodeBlock code={androidGradle} /></CardContent>
          </Card>
          <Card className="glass-card border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">2. TrackingManager.kt</CardTitle></CardHeader>
            <CardContent><CodeBlock code={androidKotlin} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ios" className="space-y-3 mt-4">
          <Card className="glass-card border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">1. Pods</CardTitle></CardHeader>
            <CardContent><CodeBlock code={iosPodfile} /></CardContent>
          </Card>
          <Card className="glass-card border-border/30">
            <CardHeader className="pb-2"><CardTitle className="text-sm">2. TrackingManager.swift</CardTitle></CardHeader>
            <CardContent><CodeBlock code={iosSwift} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
