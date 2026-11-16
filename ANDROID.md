# IronLog no Android

O app é uma PWA que também corre como app Android nativo via
[Capacitor](https://capacitorjs.com). Esta pasta-guia explica como gerar o APK,
instalar no telemóvel e publicar.

O projeto nativo vive em `android/` e é gerado a partir de `dist/`. Nunca se
edita o código web lá dentro: altera-se `src/`, corre-se `npm run android:sync`
e o Capacitor copia os assets.

## O que muda em relação à PWA

| Tema | PWA (navegador) | App Android |
| --- | --- | --- |
| Alarme de descanso | Notificação do browser, se autorizada (sem som próprio) | Notificação local nativa **silenciosa** via `AlarmManager`, acorda o telemóvel com o ecrã bloqueado |
| Vibração | `navigator.vibrate` | plugin Haptics (`VIBRATE`) |
| Ecrã sempre ligado no treino | Wake Lock API | plugin Keep Awake |
| Exportar backup | download do `.json`/`.csv` | grava na cache e abre o menu de partilha |
| Dados | IndexedDB do navegador | IndexedDB do WebView (storage separado) |

**Os dados não migram sozinhos entre PWA e APK.** Exporte o backup na PWA
(Configurações → Exportar) e importe no app (Configurações → Importar).

## Ambiente de desenvolvimento

Já instalado nesta máquina:

- Android Studio 2026.2.2.8 — `C:\Program Files\Android\Android Studio`
- Android SDK — `%LOCALAPPDATA%\Android\Sdk` (`platform-tools`, `platforms;android-36`, `build-tools;36.0.0`)
- JDK 21 (Temurin) — `%LOCALAPPDATA%\jdks\temurin-21`

Variáveis de ambiente (âmbito do utilizador, uma vez só):

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "$env:LOCALAPPDATA\jdks\temurin-21"
```

> O JBR que vem com o Android Studio é o JDK 25 e o Gradle 8.14 falha nele
> (`Unsupported class file major version 69`). Use o Temurin 21 para compilar.
> O Android Studio continua a abrir com o seu próprio JBR; em
> *Settings → Build, Execution, Deployment → Build Tools → Gradle* escolha o
> **JDK 21** em "Gradle JDK".

Verificar:

```powershell
java -version          # 21.x
adb version
```

As versões (AGP, Gradle, SDK) estão fixas em `android/build.gradle` e em
`android/variables.gradle`: `compileSdk 36`, `targetSdk 36`, `minSdk 24`
(Android 7+).

## Desenvolvimento local

```powershell
npm install
npm run android:sync      # build web + copia para android/
npx cap open android      # abre o projeto no Android Studio
```

Ou, sem IDE, direto para um telemóvel/emulador ligado:

```powershell
cd android
.\gradlew.bat installDebug
```

### Emulador

No Android Studio: *Device Manager → Create device → Pixel 7 → API 36*.
Arranque o emulador antes de `installDebug`. Para testar o alarme a sério,
prefira um telemóvel real: o emulador não reproduz o Doze nem o bloqueio de
ecrã como o hardware.

### Telemóvel por USB

1. No telemóvel: *Definições → Sobre → toque 7× em "Número da versão"*.
2. *Opções de programador → Depuração USB* ligada.
3. Ligue o cabo, aceite o pedido de autorização.
4. `adb devices` deve listar o aparelho como `device`.

## Gerar o APK

```powershell
cd android
.\gradlew.bat assembleDebug
```

Saída: `android/app/build/outputs/apk/debug/app-debug.apk`.

Instalar por USB:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

O APK de debug é assinado com uma chave de debug: serve para testar e para
partilhar com quem aceite instalar de fonte desconhecida, não para a Play Store.

### Permissões que o app pede

- **Notificações** (Android 13+): sem ela o alarme não soa em segundo plano.
  O app pede em Configurações → Notificações.
- **Alarmes exatos** (Android 12+): sem ela o sistema pode atrasar o alarme.
  Ao abrir um treino o app mostra o pedido, e Configurações → "Permitir
  alarmes exatos" faz o mesmo. O app continua a funcionar sem isto, só que
  com o alarme inexato.
- **Vibração** e **Wake Lock**: concedidas na instalação.

Canal de notificação `rest-v2` (alta importância, sem som, vibração). O som e
a importância do canal são imutáveis depois de criado; para mudar, use um id
novo (`rest-v3`) e mude `REST_CHANNEL_ID` em `src/core/platform/notifier.ts`.

## Publicar

### GitHub Releases (gratuito, sem loja)

1. `cd android && .\gradlew.bat assembleRelease` (ver keystore abaixo).
2. GitHub → *Releases → Draft a new release* → anexe `app-release.apk`.
3. Quem instalar tem de permitir "instalar de fontes desconhecidas".

### Firebase App Distribution (testadores)

1. Crie um projeto em <https://console.firebase.google.com>.
2. *App Distribution → Começar*, adicione testadores por e-mail.
3. Envie o APK pela consola, ou instale a CLI:
   `npm i -g firebase-tools && firebase appdistribution:distribute app-release.apk --app <APP_ID> --groups testers`

### Hospedagem direta

O APK é um ficheiro estático: pode ficar no Cloudflare Pages junto com a PWA
(ex.: `https://ironlog.pages.dev/ironlog.apk`). Aponte o link para lá.

### Google Play (precisa de conta de developer, 25 USD únicos)

Requisitos:

- **AAB**, não APK: `cd android && .\gradlew.bat bundleRelease` →
  `android/app/build/outputs/bundle/release/app-release.aab`.
- **Keystore de upload** (guarde-a e ao password; sem ela não consegue
  atualizar o app):

  ```powershell
  keytool -genkeypair -v -keystore ironlog-upload.jks -alias ironlog `
    -keyalg RSA -keysize 2048 -validity 10000
  ```

  Não commite o `.jks` nem o password. Em `android/keystore.properties`
  (também fora do git):

  ```properties
  storeFile=C:/caminho/para/ironlog-upload.jks
  storePassword=...
  keyAlias=ironlog
  keyPassword=...
  ```

  E em `android/app/build.gradle`, dentro de `android { ... }`:

  ```gradle
  def keystoreProps = new Properties()
  def keystoreFile = rootProject.file('keystore.properties')
  if (keystoreFile.exists()) keystoreProps.load(new FileInputStream(keystoreFile))
  signingConfigs {
      release {
          storeFile file(keystoreProps['storeFile'])
          storePassword keystoreProps['storePassword']
          keyAlias keystoreProps['keyAlias']
          keyPassword keystoreProps['keyPassword']
      }
  }
  buildTypes { release { signingConfig signingConfigs.release } }
  ```

- **Ficha da loja**: nome, descrição curta/longa, ícone 512×512 PNG,
  gráfico de destaque 1024×500, pelo menos 2 capturas de ecrã, categoria,
  classificação de conteúdo, política de privacidade pública (a PWA não recolhe
  dados, mas a Play exige o URL) e o formulário *Data safety* — declare
  "nenhum dado recolhido/partilhado".
- **Play App Signing**: a Google re-assina o app; a sua keystore é só de upload.
- `SCHEDULE_EXACT_ALARM` é permitida, mas a Play pede justificação no
  formulário de permissões: "alarme de fim de descanso durante o treino".
  Um alarme de descanso de poucos minutos não é caso de uso de
  `USE_EXACT_ALARM` (essa é reservada a alarmes/agenda).
- Cada atualização precisa de `versionCode` maior. Está em
  `android/app/build.gradle` (`versionCode`/`versionName`).

## Problemas comuns

| Sintoma | Causa / solução |
| --- | --- |
| `Unsupported class file major version 69` | `JAVA_HOME` a apontar para o JDK 25; use o Temurin 21 |
| `SDK location not found` | `ANDROID_HOME` não definido ou sem `platforms;android-36` |
| Alarme silencioso com o ecrã bloqueado | permissão de notificações negada (o som vive na notificação) |
| Alarme atrasa alguns minutos | falta a permissão de alarmes exatos |
| Alterações no `src/` não aparecem no app | esqueceu `npm run android:sync` |
| Export não descarrega ficheiro | comportamento esperado no nativo; usa a partilha |
