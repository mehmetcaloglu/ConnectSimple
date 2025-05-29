import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  PermissionsAndroid,
  ScrollView,
  NativeModules,
  NativeEventEmitter,
  AppState,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import BLEManagerService from '../services/BLEManager';
import TimeManager from '../services/TimeManager';

// Event emitter'ı component dışında tanımla
const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const HomeScreen: React.FC = () => {
  const [macAddress, setMacAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [nextConnectionTime, setNextConnectionTime] = useState<Date | null>(null);
  const [firstConnection, setFirstConnection] = useState(false);
  const [characteristicData, setCharacteristicData] = useState<string[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [appState, setAppState] = useState(AppState.currentState);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const connectionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const clockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleNextConnectionRef = useRef<((deviceMac: string) => Promise<void>) | null>(null);
  const startRetryingConnectionRef = useRef<((deviceMac: string) => Promise<void>) | null>(null);
  const checkConnectionStatusRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

  // Saat güncelleme
  useEffect(() => {
    // Her saniye saati güncelle
    clockTimerRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => {
      if (clockTimerRef.current) {
        clearInterval(clockTimerRef.current);
      }
    };
  }, []);

  // Basit permission check
  const checkPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      console.log('🔍 İzinler kontrol ediliyor...');
      const permissions = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ];

      const results = await PermissionsAndroid.requestMultiple(permissions);
      const allGranted = Object.values(results).every(
        result => result === PermissionsAndroid.RESULTS.GRANTED
      );

      console.log('📱 İzin durumu:', allGranted ? 'Verildi' : 'Verilmedi');
      return allGranted;
    } catch (error) {
      console.error('❌ İzin hatası:', error);
      return false;
    }
  };

  // Basit BLE başlatma
  const initBLE = async (): Promise<boolean> => {
    try {
      console.log('🚀 BLE başlatılıyor...');
      await BleManager.start({ showAlert: false });

      const state = await BleManager.checkState();
      console.log('📶 Bluetooth durumu:', state);

      if (state !== 'on') {
        Alert.alert('Bluetooth Kapalı', 'Lütfen Bluetooth\'u açın');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ BLE başlatma hatası:', error);
      return false;
    }
  };

  // Cihaz verilerini alma
  const retrieveDeviceData = async (deviceMac: string) => {
    try {
      console.log('📱 Cihaz verileri alınıyor:', deviceMac);
      
      // Cihaz servislerini al
      const services = await BleManager.retrieveServices(deviceMac);
      console.log('📱 Cihaz servisleri:', JSON.stringify(services, null, 2));
      
      // Hedef karakteristiği al (15. eleman, index 14)
      if (services.characteristics && services.characteristics.length >= 15) {
        const targetCharacteristic = services.characteristics[14].characteristic;
        console.log('📱 Hedef karakteristik:', targetCharacteristic);
        
        // Mevcut listeye ekle
        setCharacteristicData(prev => [...prev, targetCharacteristic]);
      } else {
        console.log('📱 Hedef karakteristik bulunamadı');
      }
      
    } catch (error) {
      console.error('❌ Veri alma hatası:', error);
    }
  };

  // Bağlantı durumu kontrolü
  const startConnectionCheck = useCallback((deviceMac: string) => {
    if (connectionCheckRef.current) return;
    
    console.log('🔍 Bağlantı kontrolü başlatılıyor:', deviceMac);
    connectionCheckRef.current = setInterval(async () => {
      try {
        const bleManager = BLEManagerService.getInstance();
        const isConnected = await bleManager.isDeviceConnected(deviceMac);
        
        if (!isConnected) {
          console.log('🔍 Cihaz bağlantısı kesildi:', deviceMac);
          setIsConnected(false);
          if (connectionCheckRef.current) {
            clearInterval(connectionCheckRef.current);
            connectionCheckRef.current = null;
          }
          if (intervalRef.current) {
            clearTimeout(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('❌ Bağlantı kontrolü hatası:', error);
      }
    }, 3000);
  }, []);

  // Bağlantı kontrolünü durdur
  const stopConnectionCheck = useCallback(() => {
    if (connectionCheckRef.current) {
      console.log('🔍 Bağlantı kontrolü durduruluyor');
      clearInterval(connectionCheckRef.current);
      connectionCheckRef.current = null;
    }
  }, []);

  // Yeniden bağlanma denemesi
  const startRetryingConnection = useCallback(async (deviceMac: string) => {
    if (isRetrying) {
      console.log('🔄 Zaten bağlantı denemeleri yapılıyor, tekrar başlatılmıyor');
      return;
    }
    
    console.log('🔄 Bağlantı denemeleri başlatılıyor...');
    setIsRetrying(true);
    setRetryMessage('Tekrar bağlanılmaya çalışılıyor...');
    retryCountRef.current = 0;
    
    const maxRetries = 100; // 20 saniye / 200ms = 100 deneme
    const retryInterval = 200; // 200ms
    const startTime = new Date().getTime();
    const endTime = startTime + (20 * 1000); // 20 saniye sonra
    
    console.log('🔄 Bağlantı denemeleri:', new Date(startTime).toLocaleTimeString(), '-', new Date(endTime).toLocaleTimeString());
    
    const attemptConnection = async () => {
      try {
        retryCountRef.current++;
        const currentTime = new Date();
        setRetryMessage(`Tekrar bağlanılmaya çalışılıyor... (${retryCountRef.current})`);
        
        console.log(`🔄 Bağlantı denemesi ${retryCountRef.current}/${maxRetries} - ${currentTime.toLocaleTimeString()}`);
        const bleManager = BLEManagerService.getInstance();
        await bleManager.connectToDevice(deviceMac);
        
        // Bağlantı başarılı
        console.log('✅ Yeniden bağlantı başarılı!');
        setIsConnected(true);
        setIsRetrying(false);
        setRetryMessage('');
        
        // Cihaz verilerini al
        console.log('📱 Cihaz verileri alınıyor...');
        await retrieveDeviceData(deviceMac);
        
        // Son bağlantı zamanını kaydet
        const timeManager = TimeManager.getInstance();
        await timeManager.saveLastConnectionTime();
        const nextTime = await timeManager.getNextConnectionTime();
        setNextConnectionTime(nextTime);
        
        // Planlanan bir sonraki bağlantı için zamanlayıcıyı ayarla
        console.log('⏰ Bir sonraki bağlantı planlanıyor...');
        if (scheduleNextConnectionRef.current) {
          scheduleNextConnectionRef.current(deviceMac);
        }
        
        return true;
      } catch (error) {
        console.log(`❌ Bağlantı denemesi ${retryCountRef.current} başarısız:`, error);
        
        const now = new Date().getTime();
        if (now < endTime && retryCountRef.current < maxRetries) {
          // Hala denemeye devam et
          console.log(`🔄 ${retryInterval}ms sonra tekrar denenecek (${retryCountRef.current}/${maxRetries})`);
          console.log(`🔄 Kalan süre: ${Math.floor((endTime - now) / 1000)} saniye`);
          retryTimerRef.current = setTimeout(() => attemptConnection(), retryInterval);
          return false;
        } else {
          // Maksimum deneme sayısına ulaşıldı veya süre doldu
          console.log('❌ Maksimum bağlantı denemesi sayısına ulaşıldı veya süre doldu');
          console.log('❌ Toplam deneme sayısı:', retryCountRef.current);
          console.log('❌ Toplam geçen süre:', (new Date().getTime() - startTime) / 1000, 'saniye');
          setIsRetrying(false);
          setRetryMessage('');
          
          // Bir sonraki periyot için yine zamanlayıcıyı ayarla
          console.log('⏰ Bir sonraki periyot için yeniden planlama yapılıyor...');
          if (scheduleNextConnectionRef.current) {
            scheduleNextConnectionRef.current(deviceMac);
          }
          return false;
        }
      }
    };
    
    await attemptConnection();
  }, [isRetrying]);

  // startRetryingConnection fonksiyonunu useRef'e ata
  useEffect(() => {
    startRetryingConnectionRef.current = startRetryingConnection;
  }, [startRetryingConnection]);

  // Düzenli bağlantı kontrolü
  const checkConnectionStatus = useCallback(async (force: boolean = false) => {
    if ((!macAddress || !firstConnection) && !force) return;
    
    try {
      const timeManager = TimeManager.getInstance();
      const shouldConnect = await timeManager.shouldConnect();
      
      if (shouldConnect) {
        console.log('⏰ Bağlantı zamanı geldi, bağlantı başlatılıyor...');
        if (startRetryingConnectionRef.current && macAddress) {
          startRetryingConnectionRef.current(macAddress);
        } else {
          console.log('⚠️ MAC adresi yok veya startRetryingConnectionRef.current yok!');
        }
      } else {
        const nextTime = await timeManager.getNextConnectionTime();
        setNextConnectionTime(nextTime);
        console.log('⏰ Henüz bağlantı zamanı gelmedi. Bir sonraki kontrol 10 saniye sonra.');
      }
    } catch (error) {
      console.error('❌ Bağlantı durumu kontrolü hatası:', error);
    }
  }, [macAddress, firstConnection]);

  // checkConnectionStatus fonksiyonunu useRef'e ata
  useEffect(() => {
    checkConnectionStatusRef.current = checkConnectionStatus;
  }, [checkConnectionStatus]);

  // Bir sonraki bağlantıyı planla
  const scheduleNextConnection = useCallback(async (deviceMac: string) => {
    try {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
        console.log('⏱️ Önceki zamanlayıcı temizlendi');
      }
      
      // Son bağlantı zamanını ve bir sonraki bağlantı zamanını al
      const timeManager = TimeManager.getInstance();
      const lastConnectionTime = await timeManager.getLastConnectionTime();
      const nextTime = await timeManager.getNextConnectionTime();
      setNextConnectionTime(nextTime);
      
      if (!lastConnectionTime) {
        console.log('⚠️ Son bağlantı zamanı bulunamadı, zamanlama yapılamıyor');
        return;
      }
      
      // Bağlantı denemesine kadar kalan süreyi hesapla
      const timeToNextTry = await timeManager.getTimeTillNextTry();
      
      console.log('⏰ ZAMANLAMA BİLGİLERİ:');
      console.log('⏰ Son bağlantı zamanı:', new Date(lastConnectionTime).toLocaleTimeString());
      console.log('⏰ Şu anki zaman:', new Date().toLocaleTimeString());
      console.log('⏰ Bir sonraki bağlantı zamanı:', nextTime.toLocaleTimeString());
      console.log('⏰ Bağlantı denemesine kalan süre (ms):', timeToNextTry);
      console.log('⏰ Bağlantı denemeleri başlangıç saati:', new Date(Date.now() + timeToNextTry).toLocaleTimeString());
      
      if (timeToNextTry > 0) {
        // Zamanlayıcıyı tam olarak 5 dakika 50 saniye sonra tetiklenecek şekilde ayarla
        console.log(`⏰ ${Math.floor(timeToNextTry / 1000)} saniye sonra bağlantı denemeleri başlayacak`);
        console.log(`⏰ Zamanlayıcı kuruluyor: ${new Date().toLocaleTimeString()}`);
        
        // Düzenli kontrolü durdur, zamanlayıcı kullan
        if (connectionMonitorRef.current) {
          clearInterval(connectionMonitorRef.current);
          connectionMonitorRef.current = null;
          console.log('🔍 Düzenli bağlantı kontrolü durduruldu, tam zamanlayıcı kullanılacak');
        }
        
        // Zamanlayıcıyı ayarla
        intervalRef.current = setTimeout(() => {
          console.log(`⏰ ZAMANLAYICI TETİKLENDİ! Saat: ${new Date().toLocaleTimeString()}`);
          console.log(`⏰ Şu an bağlantı denemelerini başlatıyorum!`);
          if (startRetryingConnectionRef.current) {
            startRetryingConnectionRef.current(deviceMac);
          } else {
            console.log('⚠️ startRetryingConnectionRef.current yok!');
          }
        }, timeToNextTry);
        
        console.log('⏰ Zamanlayıcı kuruldu, interval referansı:', !!intervalRef.current);
      } else {
        // Eğer zaman geçmişse, hemen başlat
        console.log('⏰ Bağlantı zamanı geçmiş veya hemen başlamalı, bağlantı denemeleri başlatılıyor');
        if (startRetryingConnectionRef.current) {
          startRetryingConnectionRef.current(deviceMac);
        } else {
          console.log('⚠️ startRetryingConnectionRef.current yok!');
        }
      }
    } catch (error) {
      console.error('⚠️ Bağlantı planlanırken hata oluştu:', error);
    }
  }, []);

  // scheduleNextConnection fonksiyonunu useRef'e ata
  useEffect(() => {
    scheduleNextConnectionRef.current = scheduleNextConnection;
  }, [scheduleNextConnection]);

  // App state değişimini izle
  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      console.log('📱 Uygulama durumu değişti:', appState, '->', nextAppState);
      setAppState(nextAppState);
      
      // Eğer uygulama ön plana çıktıysa ve ilk bağlantı yapılmışsa bağlantı kontrolü yap
      if (nextAppState === 'active' && firstConnection && macAddress) {
        console.log('📱 Uygulama ön plana çıktı, bağlantı durumu kontrol ediliyor...');
        checkConnectionStatus();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [appState, firstConnection, macAddress, checkConnectionStatus]);

  // Temizlik işlemi
  useEffect(() => {
    return () => {
      console.log('🧹 Temizlik yapılıyor...');
      if (intervalRef.current) clearTimeout(intervalRef.current);
      if (connectionCheckRef.current) clearInterval(connectionCheckRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (connectionMonitorRef.current) clearInterval(connectionMonitorRef.current);
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
      bleManagerEmitter.removeAllListeners('BleManagerDisconnectPeripheral');
    };
  }, []);

  // Saati biçimlendirme
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const handleConnect = async () =>
  {
    console.log('Bağlantı deneniyor...');
    if (!macAddress) {
      Alert.alert('Hata', 'Lütfen MAC adresi girin');
      return;
    }
    
    // MAC adresi format kontrolü
    const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macPattern.test(macAddress)) {
      Alert.alert(
        'Geçersiz MAC Adresi', 
        'MAC adresi formatı yanlış.\nDoğru format: F0:F8:F2:DA:37:6F\n\nNot: "FO" geçersiz, "F0" olmalı.'
      );
      return;
    }
    
    // İzinleri kontrol et
    const hasPermissions = await checkPermissions();
    if (!hasPermissions) {
      Alert.alert('İzin Gerekli', 'Bluetooth bağlantısı için izinler gerekli');
      return;
    }

    // BLE'yi başlat
    const bleReady = await initBLE();
    if (!bleReady) return;
    
    console.log('📱 Cihaza bağlanılıyor:', macAddress);
    try {
      const bleManager = BLEManagerService.getInstance();
      await bleManager.connectToDevice(macAddress);
      console.log('✅ Cihaza bağlantı başarılı!');
      setIsConnected(true);
      setFirstConnection(true);
      
      // Cihaz verilerini al
      console.log('📱 İlk bağlantı için cihaz verileri alınıyor...');
      await retrieveDeviceData(macAddress);
      
      // Bağlantı durumu kontrolünü başlat
      console.log('🔍 Bağlantı durumu kontrolü başlatılıyor...');
      startConnectionCheck(macAddress);
      
      const timeManager = TimeManager.getInstance();
      console.log('⏰ Son bağlantı zamanı kaydediliyor...');
      await timeManager.saveLastConnectionTime();
      
      // Bir sonraki bağlantıyı planla
      console.log('⏰ Bir sonraki bağlantı planlanıyor...');
      await scheduleNextConnection(macAddress);
      
      Alert.alert('Başarılı', 'Cihaza bağlanıldı');
    } catch (error) {
      console.error('❌ Bağlantı hatası:', error);
      Alert.alert('Hata', `Cihaza bağlanılamadı: ${error}`);
    }
  };

  const handleDisconnect = async () => {
    console.log('Cihazdan bağlantı kesiliyor:', macAddress);
    try {
      const bleManager = BLEManagerService.getInstance();
      await bleManager.disconnectDevice(macAddress);
      setIsConnected(false);
      setFirstConnection(false);
      
      // Bağlantı kontrolünü durdur
      stopConnectionCheck();
      
      // Zamanlayıcıları temizle
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      
      if (connectionMonitorRef.current) {
        clearInterval(connectionMonitorRef.current);
        connectionMonitorRef.current = null;
      }
      
      setIsRetrying(false);
      setRetryMessage('');
      
      Alert.alert('Başarılı', 'Cihaz bağlantısı kesildi');
    } catch (error) {
      console.error('Bağlantı kesme hatası:', error);
      Alert.alert('Hata', 'Cihaz bağlantısı kesilemedi');
    }
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BLE Connector</Text>
      
      <View style={styles.clockContainer}>
        <Text style={styles.clockText}>{formatTime(currentTime)}</Text>
      </View>
      
      <TextInput
        style={styles.input}
        placeholder="MAC Adresi (örn: AA:BB:CC:DD:EE:FF)"
        value={macAddress}
        onChangeText={setMacAddress}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.button, isConnected ? styles.disconnectButton : styles.connectButton]}
        onPress={isConnected ? handleDisconnect : handleConnect}
        disabled={!macAddress}
      >
        <Text style={styles.buttonText}>
          {isConnected ? 'Bağlantıyı Kes' : 'Bağlan'}
        </Text>
      </TouchableOpacity>
      
      {firstConnection && nextConnectionTime && (
        <Text style={styles.nextConnectionText}>
          Sonraki bağlantı: {nextConnectionTime.toLocaleTimeString()}
        </Text>
      )}
      
      {isRetrying && (
        <Text style={styles.retryingText}>
          {retryMessage}
        </Text>
      )}
      
      {characteristicData.length > 0 && (
        <View style={styles.dataContainer}>
          <Text style={styles.dataTitle}>Karakteristik Verileri:</Text>
          <ScrollView style={styles.dataList}>
            {characteristicData.map((item, index) => (
              <View key={index} style={styles.dataItem}>
                <Text style={styles.dataText}>
                  {index + 1}. Bağlantı: {item}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  button: {
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  connectButton: {
    backgroundColor: '#007AFF',
  },
  disconnectButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextConnectionText: {
    marginTop: 20,
    textAlign: 'center',
    color: '#666',
  },
  retryingText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#ff8c00',
    fontWeight: 'bold',
  },
  dataContainer: {
    marginTop: 20,
    flex: 1,
  },
  dataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  dataList: {
    maxHeight: 300,
  },
  dataItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
    marginVertical: 2,
    borderRadius: 5,
  },
  dataText: {
    fontSize: 14,
    color: '#333',
  },
  clockContainer: {
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 20,
    alignSelf: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  clockText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
});

export default HomeScreen; 