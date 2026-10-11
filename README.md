# Fatih Hoca — Öğrenci Takip Sistemi

Mavi temalı, mobil uyumlu öğrenci takip web sitesi. **GitHub Pages + Firebase** kullanır; npm kurulumu gerekmez. Veriler tarayıcıda değil, kalıcı olarak Cloud Firestore'da saklanır.

## İçindekiler

- Öğretmen e-posta/şifre girişi
- Veliler için Google ile giriş
- 5–12. sınıf ve mezun öğrenci kayıtları
- Ders/konu, TYT, AYT, deneme sınavı, okunan kitap ve öğretmen yorumu kayıtları
- Öğrenci dosyası ve veli raporu
- Yazdırma penceresinden **PDF olarak kaydet**
- Firestore güvenlik kuralları

> Önemli: Bu proje bir başlangıç uygulamasıdır. Öğrenci verileri kişisel veridir. Gerçek kullanım öncesinde KVKK yükümlülüklerini, erişim izinlerini ve yedekleme politikasını kontrol edin. Gerçek öğrenci bilgilerini test aşamasında kullanmayın.

---

## 1. Firebase projesi oluştur

1. https://console.firebase.google.com/ adresine girip proje oluştur.
2. **Build → Authentication → Get started** bölümünde:
   - **Email/Password** sağlayıcısını etkinleştir.
   - **Google** sağlayıcısını etkinleştir ve destek e-postasını seç.
3. **Build → Firestore Database** bölümünden veritabanı oluştur. Üretimde uygun konumu seç.
4. **Project settings → General → Your apps → Web app** ile web uygulaması ekle.
5. Firebase'in verdiği `firebaseConfig` alanlarını aşağıdaki dosyaya aktar.

## 2. Firebase ayarını ekle

`firebase-config.js` dosyasını aç ve örnek değerleri Firebase Console'daki gerçek değerlerle değiştir. `apiKey`, `projectId`, `appId` gibi web yapılandırma değerleri istemci uygulamalarında görünür; güvenlik bunları gizlemeye değil, Authentication ve Firestore Rules'a dayanır. **Service account/private key gibi sunucu sırlarını asla GitHub'a koyma.**

## 3. Firestore güvenlik kurallarını yayımla

Firebase Console → **Firestore Database → Rules** bölümüne `firestore.rules` dosyasındaki kuralları kopyala ve Publish'e bas.

Bu kurallar:
- Öğretmen rolü olan hesaplara öğrenci ve gelişim kaydı yönetme izni verir.
- Velilerin yalnızca Google hesabındaki e-posta adresi öğrenci kaydındaki `parentEmail` alanıyla eşleşen öğrenci kayıtlarını okumasına izin verir.
- Velilerin öğrenci veya kayıt eklemesini/değiştirmesini engeller.

## 4. Öğretmen hesabını oluştur ve yetkilendir

1. Firebase Console → Authentication → Users → **Add user** ile öğretmenin e-posta adresini ve güçlü bir şifreyi oluştur.
2. Kullanıcı listesinde öğretmenin **UID** değerini kopyala.
3. Firestore Database → Data → **Start collection**:
   - Collection ID: `users`
   - Document ID: öğretmenin UID'si (UID'yi aynen kullan)
   - Fields:
     - `role` (string): `teacher`
     - `email` (string): öğretmenin e-posta adresi
4. Bu `users/{UID}` belgesini yönetici olarak Firebase Console'dan oluştur. Uygulama üzerinden kimse kendi rolünü `teacher` yapamaz.

Öğretmen girişinde bu e-posta ve şifre kullanılacak. Eski örneklerde geçen `fatihhoca / fatih45` gibi ortak/varsayılan şifreleri kullanma; bu projede öğretmen girişi e-posta ve Firebase Authentication şifresiyle yapılır.

## 5. Google ile giriş yapan velinin profilini ekle

Bu sürümde veli erişimi, öğrenci kaydına yazılan Google hesabı e-posta adresiyle eşleşir. Velinin Google ile ilk girişinden sonra Firestore'da `users` koleksiyonuna kendi UID'siyle belge ekle:

- Document ID: velinin Authentication UID'si
- `role` (string): `parent`
- `email` (string): velinin Google e-posta adresi
- `createdAt` (timestamp): istersen mevcut tarih/saat

Bunu yalnızca yönetici Firebase Console'dan oluşturabilir. Uygulamanın güvenlik kuralları, kullanıcıların kendi kendine `parent` belgesi oluşturmasına da izin verir; ancak bu başlangıç sürümünde profil belgesini elle eklemek en kolay ilk kurulumdur. E-posta adresi Google hesabındaki adresle aynı olmalı.

## 6. Öğrencileri ekle

Öğretmen giriş yaptıktan sonra **Yeni öğrenci** butonunu kullan. Veli e-posta alanına velinin Google hesabındaki adresi doğru gir. Veliler kendi hesaplarıyla giriş yapıp çocuklarının adını arayabilir.

## 7. GitHub'a yükle ve yayımla

1. GitHub'da yeni bir repository oluştur (ör. `fatih-ogrenci-takip`).
2. `index.html`, `style.css`, `app.js`, `firebase-config.js` ve diğer proje dosyalarını repository'nin kök dizinine yükle.
3. Repository → **Settings → Pages**:
   - Build and deployment: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/(root)`
   - Save
4. GitHub Pages URL'si oluşana kadar bekle. Örnek URL'yi tahmin edip kullanma; GitHub'ın verdiği URL'yi aç.
5. Firebase Console → Authentication → Settings → Authorized domains bölümüne GitHub Pages alan adını ekle (ör. `kullanici.github.io`; kendi gerçek alan adını kullan).
6. Web sitesini açıp öğretmen ve veli girişini test et.

## 8. PDF raporu

Öğrenci dosyasındaki **PDF raporu yazdır / kaydet** butonu tarayıcının yazdırma penceresini açar. Hedef yazıcı olarak **PDF olarak kaydet** seçeneğini seç. Veli de kendi rapor ekranından aynı işlemi yapabilir.

## 9. Dosya yapısı

```text
fatih_github_ogrenci_takip/
├── index.html
├── style.css
├── app.js
├── firebase-config.js
├── firestore.rules
└── README.md
```

## Sorun giderme

- **unauthorized-domain**: Firebase Authentication → Settings → Authorized domains kısmına GitHub Pages alan adını ekle.
- **permission-denied**: `firestore.rules` yayımlandı mı? Öğretmen UID'si `users/{UID}` belgesinde `role: teacher` olarak doğru mu?
- **Veli öğrenci bulamıyor**: Öğrenci belgesindeki `parentEmail`, Google ile giriş yapılan hesabın e-posta adresiyle birebir eşleşmeli.
- **Öğretmen giriş yapamıyor**: Authentication → Users bölümünde kullanıcı oluşturulmuş mu ve e-posta/şifre doğru mu?
- **Google giriş penceresi açılmıyor**: Google sağlayıcısını etkinleştir, destek e-postasını seç ve yetkili alan adını ekle.

## Güvenlik notları

- `firestore.rules` dosyasını uygulamadan önce incele ve test et.
- GitHub repository'si herkese açıksa yapılandırma dosyaları da görünür; Firebase web config tek başına yönetici erişimi vermez, ancak güvenlik kuralları doğru olmalıdır.
- Öğrenci adları, notları ve yorumları hassas olabileceğinden herkese açık örnek veri kullanma.
- Öğrenci silme işlemi uygulamada alt koleksiyondaki kayıtları önce siler; büyük veri hacimlerinde yönetici tarafından sunucu taraflı silme mekanizması tercih edilir.
- Bu uygulama tek öğretmenli basit kurulum içindir. Çok öğretmenli sistem, audit log, otomatik yedek, davet akışı veya gerçek otomatik PDF dosyası istenirse ayrıca geliştirilmelidir.
