#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <cmath>

// ==========================================
// 1. KONFIGURASI JARINGAN & PERANGKAT
// ==========================================
const char* ssid     = ""; 
const char* password = "";    

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Definisikan Pin Fisik NodeMCU V3 (Lolin)
const int BUZZER_PIN = D5; 

// URL API KHUSUS GEMPA 
const char* bmkg_url = "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json";

// ==========================================
// 2. GEOLOCK AREA: GABUNGAN JATENG & DIY
// ==========================================
const float CENTROID_LAT = -7.3500;       // Titik tengah wilayah Jawa Tengah - Yogyakarta
const float CENTROID_LON = 110.2000;     
const float RADIUS_MAX_KM = 300.0;        // Radius payung pelindung 300 Kilometer

String idGempaTerakhir = ""; 

// ==========================================
// 3. LOGIKA MATEMATIKA HAVERSINE (JARAK BUMI)
// ==========================================
float hitungJarakKeWilayah(float gempaLat, float gempaLon) {
  float R = 6371.0; 
  float dLat = (gempaLat - CENTROID_LAT) * M_PI / 180.0;
  float dLon = (gempaLon - CENTROID_LON) * M_PI / 180.0;
  
  float lat1 = CENTROID_LAT * M_PI / 180.0;
  float lat2 = gempaLat * M_PI / 180.0;
  
  float a = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1) * cos(lat2) * 
            sin(dLon / 2) * sin(dLon / 2);
  float c = 2 * atan2(sqrt(a), sqrt(1 - a));
  
  return R * c; 
}

// ==========================================
// 4. SIRINE BENCANA & SINKRONISASI KEDIPAN LED
// ==========================================
void bunyikanSirineBencana(int durasiDetik) {
  Serial.println("ALARM AKTIF");
  unsigned long waktuMulai = millis();
  
  while (millis() - waktuMulai < (durasiDetik * 1000)) {
    
    // FASE A: Nada Menyapu Naik + Lampu LED Bawaan NYALA
    digitalWrite(LED_BUILTIN, LOW); // LOW = Menyala biru pada NodeMCU V3
    for (int hz = 900; hz <= 2200; hz += 25) {
      tone(BUZZER_PIN, hz);
      delay(4);
    }
    
    // FASE B: Nada Menyapu Turun + Lampu LED Bawaan MATI
    digitalWrite(LED_BUILTIN, HIGH); // HIGH = Mematikan lampu
    for (int hz = 2200; hz >= 900; hz -= 25) {
      tone(BUZZER_PIN, hz);
      delay(4);
    }
  }
  
  // Matikan total aktuator saat durasi habis
  noTone(BUZZER_PIN); 
  digitalWrite(LED_BUILTIN, HIGH); 
}

// ==========================================
// 5. DRIVER UPDATE TAMPILAN LAYAR OLED
// ==========================================
void tampilkanKeOLED(String status, String info1, String info2) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  display.setCursor(0, 0);
  display.println("> ALARM GEMPA <");
  display.println("---------------------");
  
  display.setCursor(0, 20);
  display.print("STATUS: ");
  display.println(status);
  
  display.setCursor(0, 38);
  display.println(info1);
  
  display.setCursor(0, 52);
  display.println(info2);
  
  display.display();
}

// ==========================================
// 6. SETUP PROGRAM AWAL
// ==========================================
void setup() {
  Serial.begin(115200);
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  
  noTone(BUZZER_PIN);
  digitalWrite(LED_BUILTIN, HIGH); // Matikan lampu LED saat standby awal

  // Inisialisasi Layar OLED i2C
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println("OLED SSD1306 gagal diinisialisasi!");
    for(;;);
  }
  
  tampilkanKeOLED("BOOTING UP", "Mengkoneksikan WiFi", "Silakan tunggu...");

  // Koneksi Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n[SUKSES] Terhubung ke Internet!");
  tampilkanKeOLED("ONLINE", "Sistem Siap", "Memonitor Lempeng...");
  delay(2000);
}

// ==========================================
// 7. LOOP UTAMA (ENGINE REALTIME)
// ==========================================
void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // Bypass SSL handshake demi efisiensi RAM

    HTTPClient http;
    Serial.println("[INFO] Memindai log gempa dirasakan BMKG...");

    if (http.begin(client, bmkg_url)) {
      int httpCode = http.GET();

      if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        
        // Alokasi memori dokumen JSON (Data "dirasakan" cenderung menyimpan array teks panjang)
        DynamicJsonDocument doc(4096);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          // [0] Mengambil indeks paling atas (Gempa paling baru hari ini)
          JsonObject gempa = doc["Infogempa"]["gempa"]; 
          
          String tanggal = gempa["Tanggal"].as<String>();
          String waktu   = gempa["Jam"].as<String>();
          
          // Penanda Unik Peristiwa Gempa
          String idGempaSekarang = tanggal + "_" + waktu;

          if (idGempaSekarang != idGempaTerakhir) {
            idGempaTerakhir = idGempaSekarang;

            // FIX: Mengubah "Koordinat" menjadi "Coordinates" sesuai struktur JSON BMKG Dirasakan
            String koordinatRaw = gempa["Coordinates"].as<String>();
            int posisiKoma = koordinatRaw.indexOf(',');
            float gempaLat = koordinatRaw.substring(0, posisiKoma).toFloat();
            float gempaLon = koordinatRaw.substring(posisiKoma + 1).toFloat();

            // FIX: Mengubah "Magnitudo" menjadi "Magnitude" sesuai struktur JSON BMKG Dirasakan
            float magnitudo = gempa["Magnitude"].as<float>();
            String wilayah  = gempa["Wilayah"].as<String>();

            // EKSTRAKSI PEMBERSIHAN STRING WILAYAH (Agar tampil spesifik dan muat di OLED)
            String wilayahSpesifik = wilayah;
            int indeksKeyword = wilayahSpesifik.indexOf("km ");
            if (indeksKeyword != -1) {
              // Mengambil teks tepat setelah informasi jarak "km " (Contoh: "Timur Buru Selatan")
              wilayahSpesifik = wilayahSpesifik.substring(indeksKeyword + 3);
            }
            // Batasi panjang karakter akhir agar estetika baris OLED tetap aman
            if (wilayahSpesifik.length() > 21) {
              wilayahSpesifik = wilayahSpesifik.substring(0, 19) + "..";
            }

            // Kalkulasi Jarak Episentrum ke Titik Centroid Jateng-DIY
            float jarakKeLokasi = hitungJarakKeWilayah(gempaLat, gempaLon);

            // Redundansi Filter Pencocokan Kata Kunci Wilayah Teks Lokal
            String wilayahLower = wilayah;
            wilayahLower.toLowerCase();
            bool sebutWilayahKita = (wilayahLower.indexOf("diy") >= 0) || 
                                     (wilayahLower.indexOf("yogyakarta") >= 0) || 
                                     (wilayahLower.indexOf("jawa tengah") >= 0) || 
                                     (wilayahLower.indexOf("jateng") >= 0) ||
                                     (wilayahLower.indexOf("bantul") >= 0) ||
                                     (wilayahLower.indexOf("gunungkidul") >= 0) ||
                                     (wilayahLower.indexOf("kulonprogo") >= 0) ||
                                     (wilayahLower.indexOf("sleman") >= 0);

            // LOGIKA FILTERING EVALUASI DAN EKSEKUSI ALARM
            if (jarakKeLokasi <= RADIUS_MAX_KM || sebutWilayahKita) {
              Serial.println("ALERT: DETEKSI AKTIVITAS GEMPA DIRASAKAN DI LOKAL JATENG-DIY!");
              
              String infoMag = "M: " + String(magnitudo) + " SR | " + String((int)jarakKeLokasi) + "KM";
              String infoLoc = "Loc: " + wilayahSpesifik;
              
              tampilkanKeOLED("AWAS GEMPA!", infoMag, infoLoc);

              // Pembagian durasi berdasarkan kekuatan (karena mengakomodasi gempa mikro dirasakan)
              if (magnitudo >= 5.0) {
                bunyikanSirineBencana(15); // Gempa signifikan, alarm 15 detik
              } else {
                bunyikanSirineBencana(5);  // Gempa lokal kecil (<5 SR) tapi dirasakan, alarm pendek 5 detik
              }
            } else {
              Serial.println("Gempa terdeteksi di luar area jangkauan aman Jateng-DIY.");
              
              String infoMag = "M: " + String(magnitudo) + " SR";
              String infoLoc = "Loc: " + wilayahSpesifik;
              
              tampilkanKeOLED("AMAN", infoMag, infoLoc);
            }
          } else {
            Serial.println("[STANDBY] Belum ada laporan getaran baru.");
          }
        }
      }
      http.end();
    }
  } else {
    tampilkanKeOLED("OFFLINE", "Koneksi Terputus", "Mencoba Reconnect...");
    WiFi.begin(ssid, password);
  }

  // Melakukan request berkala setiap 3 menit (180000 ms) agar aman dari rate limiting/banned IP
  delay(180000); 
}
