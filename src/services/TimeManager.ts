import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_CONNECTION_TIME_KEY = '@last_connection_time';
const CONNECTION_INTERVAL = 6 * 60 * 1000; // 6 dakika (milisaniye cinsinden)
const CONNECTION_EARLY_START = 10 * 1000; // 10 saniye önce bağlanmaya başla

class TimeManager {
  private static instance: TimeManager;

  private constructor() {
    console.log('🕒 TimeManager oluşturuldu');
    console.log('🕒 Bağlantı aralığı:', CONNECTION_INTERVAL, 'ms (', CONNECTION_INTERVAL / 60000, 'dakika)');
    console.log('🕒 Erken başlama süresi:', CONNECTION_EARLY_START, 'ms (', CONNECTION_EARLY_START / 1000, 'saniye)');
  }

  public static getInstance(): TimeManager {
    if (!TimeManager.instance) {
      TimeManager.instance = new TimeManager();
    }
    return TimeManager.instance;
  }

  public async saveLastConnectionTime(): Promise<void> {
    try {
      const currentTime = new Date().getTime();
      await AsyncStorage.setItem(LAST_CONNECTION_TIME_KEY, currentTime.toString());
      console.log('🕒 Son bağlantı zamanı kaydedildi:', new Date(currentTime).toLocaleTimeString());
    } catch (error) {
      console.error('🕒 Son bağlantı zamanı kaydedilemedi:', error);
      throw error;
    }
  }

  public async getLastConnectionTime(): Promise<number | null> {
    try {
      const timeString = await AsyncStorage.getItem(LAST_CONNECTION_TIME_KEY);
      const time = timeString ? parseInt(timeString, 10) : null;
      console.log('🕒 Son bağlantı zamanı alındı:', time ? new Date(time).toLocaleTimeString() : 'Bulunamadı');
      return time;
    } catch (error) {
      console.error('🕒 Son bağlantı zamanı alınamadı:', error);
      throw error;
    }
  }

  public async shouldConnect(): Promise<boolean> {
    try {
      const lastConnectionTime = await this.getLastConnectionTime();
      if (!lastConnectionTime) {
        console.log('🕒 İlk bağlantı - hemen bağlanmalı');
        return true;
      }

      const currentTime = new Date().getTime();
      const timeSinceLastConnection = currentTime - lastConnectionTime;
      
      // Belirlenen süreden 10 saniye öncesinden itibaren bağlantıya izin ver
      const shouldConnect = timeSinceLastConnection >= (CONNECTION_INTERVAL - CONNECTION_EARLY_START);

      console.log('🕒 Şu anki zaman:', new Date(currentTime).toLocaleTimeString());
      console.log('🕒 Son bağlantıdan bu yana geçen süre:', timeSinceLastConnection, 'ms (', timeSinceLastConnection / 60000, 'dakika)');
      console.log('🕒 Bağlantıya kalan süre:', CONNECTION_INTERVAL - timeSinceLastConnection, 'ms');
      console.log('🕒 Bağlanmalı mı?', shouldConnect);

      return shouldConnect;
    } catch (error) {
      console.error('🕒 Bağlantı zamanı kontrolü yapılamadı:', error);
      throw error;
    }
  }

  public async getNextConnectionTime(): Promise<Date> {
    try {
      const lastConnectionTime = await this.getLastConnectionTime();
      if (!lastConnectionTime) {
        // Eğer son bağlantı zamanı yoksa şu anki zamana ekle
        const currentTime = new Date().getTime();
        const nextTime = new Date(currentTime + CONNECTION_INTERVAL);
        console.log('🕒 Son bağlantı zamanı bulunamadı, şu anki zamana göre hesaplanıyor');
        console.log('🕒 Şu anki zaman:', new Date(currentTime).toLocaleTimeString());
        console.log('🕒 Bir sonraki bağlantı zamanı hesaplandı:', nextTime.toLocaleTimeString());
        console.log('🕒 Bağlantı aralığı:', CONNECTION_INTERVAL, 'ms (', CONNECTION_INTERVAL / 60000, 'dakika)');
        return nextTime;
      }
      
      // Son bağlantı zamanına CONNECTION_INTERVAL ekle
      const nextTime = new Date(lastConnectionTime + CONNECTION_INTERVAL);
      // Erken başlama zamanı
      const earlyStartTime = new Date(lastConnectionTime + CONNECTION_INTERVAL - CONNECTION_EARLY_START);
      
      console.log('🕒 Son bağlantı zamanı:', new Date(lastConnectionTime).toLocaleTimeString());
      console.log('🕒 Bir sonraki bağlantı zamanı hesaplandı:', nextTime.toLocaleTimeString());
      console.log('🕒 Bağlantı denemeleri başlangıç zamanı:', earlyStartTime.toLocaleTimeString(), '(10 saniye önce)');
      console.log('🕒 Bağlantı aralığı:', CONNECTION_INTERVAL, 'ms (', CONNECTION_INTERVAL / 60000, 'dakika)');
      return nextTime;
    } catch (error) {
      console.error('🕒 Bir sonraki bağlantı zamanı hesaplanamadı:', error);
      // Hata durumunda şu anki zamana 6 dakika ekle
      const currentTime = new Date().getTime();
      return new Date(currentTime + CONNECTION_INTERVAL);
    }
  }
  
  public async getEarlyConnectionTime(): Promise<Date> {
    try {
      const lastConnectionTime = await this.getLastConnectionTime();
      if (!lastConnectionTime) {
        const currentTime = new Date().getTime();
        return new Date(currentTime); // Hemen şimdi
      }
      
      // Son bağlantı zamanına 5 dakika 50 saniye ekle (6 dakika - 10 saniye)
      return new Date(lastConnectionTime + CONNECTION_INTERVAL - CONNECTION_EARLY_START);
    } catch (error) {
      console.error('🕒 Erken bağlantı zamanı hesaplanamadı:', error);
      const currentTime = new Date().getTime();
      return new Date(currentTime);
    }
  }
  
  public async getTimeTillNextTry(): Promise<number> {
    try {
      const earlyTime = await this.getEarlyConnectionTime();
      const currentTime = new Date().getTime();
      
      const timeTillNextTry = earlyTime.getTime() - currentTime;
      console.log('🕒 Bir sonraki bağlantı denemesine kalan süre:', timeTillNextTry, 'ms (', timeTillNextTry / 1000, 'saniye)');
      
      return Math.max(0, timeTillNextTry); // Negatifse 0 döndür
    } catch (error) {
      console.error('🕒 Bağlantı süre hesaplama hatası:', error);
      return 0;
    }
  }
}

export default TimeManager; 