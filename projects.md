# BLE Connector Projesi

## Yol Haritası

### 1. Proje Kurulumu
- [x] React Native projesi oluşturma (`npx react-native init BLEConnector`)
- [x] Gerekli bağımlılıkların kurulumu:
  - [x] react-native-ble-manager
  - [x] @react-native-async-storage/async-storage
  - [x] react-native-permissions (Bluetooth izinleri için)
- [x] Android için gerekli yapılandırmaların yapılması
- [ ] iOS için gerekli yapılandırmaların yapılması

### 2. Temel Yapı Oluşturma
- [x] Proje klasör yapısının oluşturulması
- [x] Temel bileşenlerin oluşturulması
- [x] Navigation yapısının kurulması

### 3. BLE Altyapısı
- [x] BLEManager servisinin oluşturulması
- [x] Bluetooth izinlerinin yönetimi
- [x] BLE tarama ve bağlantı fonksiyonlarının implementasyonu
- [x] Event listener yapısının kurulması

### 4. Veri Yönetimi
- [x] AsyncStorage entegrasyonu
- [x] MAC adresi ve zaman yönetimi
- [x] Hex veri okuma ve işleme yapısı
- [x] Periyodik bağlantı yönetimi (6 dakikalık periyotlar)

### 5. Kullanıcı Arayüzü
- [x] Ana ekran tasarımı (MAC adresi girişi)
- [x] Bağlantı durumu gösterimi
- [x] Hata ve bilgi mesajları
- [x] Yükleme göstergeleri

### 6. Test ve Optimizasyon
- [ ] BLE bağlantı testleri
- [ ] Veri okuma testleri
- [ ] Periyodik bağlantı testleri
- [ ] Hata durumları testleri
- [ ] Performans optimizasyonu

### 7. Dokümantasyon ve Dağıtım
- [ ] Kod dokümantasyonu
- [ ] Kullanım kılavuzu
- [ ] APK/IPA oluşturma
- [ ] Store hazırlıkları

## Proje Amacı
- Belirli bir MAC adresine sahip BLE cihazına bağlanma
- Cihazdan hex formatında veri okuma
- 6 dakikalık periyotlarla otomatik bağlanma
- İlk bağlantı zamanını kaydetme ve sonraki bağlantıları buna göre planlama

## Gerekli Kütüphaneler
- react-native-ble-manager (BLE işlemleri için)
- @react-native-async-storage/async-storage (Zaman ve MAC adresi kaydetme için)
- expo (Geliştirme ortamı)

## Tera-Glukosense Projesinden Alınacak Kodlar/Yapılar

### 1. BLE Bağlantı Yönetimi
```typescript
// ./tera-glukosense/src/components/BleDevice/index.tsx'dan alınacak
// Bağlantı yönetimi ve event handling yapısı
```

### 2. Veri Okuma
```typescript
// ./tera-glukosense/src/components/Characteristic/index.tsx'dan alınacak
// Hex formatında veri okuma yapısı
```

### 3. Android İzinleri
```xml
<!-- android/app/src/main/AndroidManifest.xml'den alınacak -->
<!-- Bluetooth ve konum izinleri -->
```

### 4. BLE Event Listener Yapısı
```typescript
// ./tera-glukosense/src/components/BleScanner/index.tsx'dan alınacak
// BLE event'lerini dinleme ve yönetme yapısı
// Özellikle bağlantı kopma durumlarını handle etme
```

### 5. Bağlantı Timeout Yönetimi
```typescript
// ./tera-glukosense/src/components/BleDevice/index.tsx'dan alınacak
// Bağlantı timeout yönetimi ve yeniden bağlanma mantığı
```

### 6. Servis Keşfi
```typescript
// ./tera-glukosense/src/components/BleDevice/DeviceServices/index.tsx'dan alınacak
// BLE servislerini keşfetme ve yönetme yapısı
```

## Proje Yapısı
```
src/
├── components/
│   ├── HomeScreen.tsx (MAC adresi girişi ve bağlantı durumu)
│   └── ConnectionStatus.tsx (Bağlantı durumu gösterimi)
├── services/
│   ├── BLEManager.ts (BLE işlemleri)
│   └── TimeManager.ts (Zaman yönetimi)
└── App.tsx
```

## Önemli Notlar
- Bluetooth izinleri runtime'da kontrol edilmeli
- Bağlantı kopma durumları handle edilmeli
- Veri okuma işlemi hex formatında yapılmalı
- AsyncStorage ile son bağlantı zamanı ve MAC adresi saklanmalı
- Periyodik bağlantı denemeleri yönetilmeli (6 dakikalık periyotlar)
- BLE event'leri düzgün şekilde temizlenmeli (cleanup)
- Bağlantı timeout durumları handle edilmeli
- Servis keşfi ve karakteristik okuma işlemleri sıralı yapılmalı 