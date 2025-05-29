import BleManager from 'react-native-ble-manager';
import { Platform, PermissionsAndroid, NativeEventEmitter, NativeModules } from 'react-native';

class BLEManagerService {
  private static instance: BLEManagerService;
  private isInitialized: boolean = false;
  private discoveredDevices: any[] = [];
  private bleManagerEmitter: NativeEventEmitter;

  private constructor() {
    this.bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);
    console.log('🔧 BLEManager: Setting up event listeners...');
    this.bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDiscoverPeripheral);
    this.bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnectPeripheral);
    console.log('🔧 BLEManager: Event listeners added');
  }

  private handleDiscoverPeripheral = (device: any) => {
    console.log('🔧 BLEManager: handleDiscoverPeripheral called with:', device.id);
    if (!this.discoveredDevices.find(d => d.id === device.id)) {
      this.discoveredDevices.push(device);
      console.log('🔧 BLEManager: Device added to internal list. Total:', this.discoveredDevices.length);
    }
  };

  private handleDisconnectPeripheral = (data: any) => {
    console.log('🔧 BLEManager: Device disconnected:', data.peripheral);
    // Bu event'i HomeScreen'de dinleyebilmek için yeniden yayınla
    this.bleManagerEmitter.emit('DeviceDisconnected', data.peripheral);
  };

  public static getInstance(): BLEManagerService {
    if (!BLEManagerService.instance) {
      BLEManagerService.instance = new BLEManagerService();
    }
    return BLEManagerService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await BleManager.start({ showAlert: false });
      this.isInitialized = true;
      console.log('BLE Manager initialized');
    } catch (error) {
      console.error('BLE Manager başlatılamadı:', error);
      throw error;
    }
  }

  public async requestPermissions(): Promise<boolean> {
    console.log('BLEManager: Requesting permissions...');
    console.log('Platform OS:', Platform.OS);
    console.log('Platform Version:', Platform.Version);
    
    if (Platform.OS === 'android') {
      try {
        // simplelink-connect gibi requestMultiple kullan
        console.log('Android: Requesting multiple permissions at once');
        
        if (Platform.Version >= 31) {
          // Android 12 ve üzeri
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          ]);
          
          console.log('Multiple permissions results:', results);
          
          const allGranted = Object.values(results).every(result => 
            result === PermissionsAndroid.RESULTS.GRANTED
          );
          
          console.log('All permissions granted:', allGranted);
          return allGranted;
        } else {
          // Android 11 ve altı
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          console.log('Location permission result:', results);
          const allGranted = Object.values(results).every(result => 
            result === PermissionsAndroid.RESULTS.GRANTED
          );
          return allGranted;
        }
      } catch (error) {
        console.error('Permission request error:', error);
        return false;
      }
    }
    
    console.log('iOS platform, returning true');
    return true;
  }

  public async scanDevices(timeout: number = 5): Promise<void> {
    try {
      await this.initialize();
      console.log('Starting BLE scan...');
      
      // Önce Bluetooth'un açık olup olmadığını kontrol et
      const isEnabled = await BleManager.checkState();
      console.log('Bluetooth state:', isEnabled);
      console.log('Bluetooth state type:', typeof isEnabled);
      
      // Android'de "on", iOS'ta "PoweredOn" döner
      const bluetoothStates = ['PoweredOn', 'on'];
      if (!bluetoothStates.includes(isEnabled.toString())) {
        console.log('Bluetooth is not enabled. State:', isEnabled);
        throw new Error('Bluetooth açık değil. Lütfen Bluetooth\'u açın.');
      }
      
      // Mevcut scan'i durdur
      try {
        await BleManager.stopScan();
        console.log('Previous scan stopped');
      } catch (e) {
        console.log('No previous scan to stop');
      }
      
      // Bağlı cihazları kontrol et
      try {
        const connectedDevices = await BleManager.getConnectedPeripherals([]);
        console.log('Connected devices:', connectedDevices.length);
      } catch (e) {
        console.log('Could not get connected devices');
      }
      
      // Permissions kontrolü
      console.log('Checking permissions before scan...');
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth izinleri verilmedi');
      }
      
      // Scan başlat
      console.log('Starting scan with timeout:', timeout);
      console.log('Scan parameters: services=[], timeout=', timeout, ', allowDuplicates=true');
      this.discoveredDevices = []; // Listeyi temizle
      
      await BleManager.scan([], timeout, true);
      console.log('Scan started successfully');
      
      // Scan başladıktan sonra bir süre bekle ve kontrol et
      setTimeout(() => {
        console.log('Discovered devices after 2 seconds:', this.discoveredDevices.length);
      }, 2000);
      
    } catch (error) {
      console.error('Cihaz tarama hatası:', error);
      throw error;
    }
  }

  public async connectToDevice(deviceId: string): Promise<void> {
    try {
      console.log('Connecting to device:', deviceId);
      
      // MAC adresi format kontrolü
      const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
      if (!macPattern.test(deviceId)) {
        throw new Error('Geçersiz MAC adresi formatı. Doğru format: AA:BB:CC:DD:EE:FF');
      }
      
      await this.initialize();
      
      // Önce cihazın zaten bağlı olup olmadığını kontrol et
      try {
        const isConnected = await BleManager.isPeripheralConnected(deviceId, []);
        if (isConnected) {
          console.log('Device already connected:', deviceId);
          return;
        }
      } catch (e) {
        console.log('Could not check if device is connected, proceeding with connection');
      }
      
      // Bağlan
      console.log('Attempting to connect...');
      await BleManager.connect(deviceId);
      console.log('Connected to device:', deviceId);
      
      // Servisleri keşfet
      try {
        const peripheralInfo = await BleManager.retrieveServices(deviceId);
        console.log('Services retrieved for device:', deviceId, peripheralInfo);
      } catch (e) {
        console.log('Could not retrieve services, but connection successful');
      }
      
    } catch (error) {
      console.error('Cihaz bağlantı hatası:', error);
      throw error;
    }
  }

  public async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await BleManager.disconnect(deviceId);
      console.log('Disconnected from device:', deviceId);
    } catch (error) {
      console.error('Cihaz bağlantısı kesme hatası:', error);
      throw error;
    }
  }

  public async readCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string
  ): Promise<number[]> {
    try {
      const data = await BleManager.read(
        deviceId,
        serviceUUID,
        characteristicUUID
      );
      return data;
    } catch (error) {
      console.error('Karakteristik okuma hatası:', error);
      throw error;
    }
  }

  public async isDeviceConnected(deviceId: string): Promise<boolean> {
    try {
      const isConnected = await BleManager.isPeripheralConnected(deviceId, []);
      console.log(`Device ${deviceId} connection status:`, isConnected);
      return isConnected;
    } catch (error) {
      console.error('Connection status check error:', error);
      return false;
    }
  }
}

export default BLEManagerService; 