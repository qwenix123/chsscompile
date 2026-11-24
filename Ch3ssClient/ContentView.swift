import SwiftUI
import SafariServices

struct ContentView: View {
    @State private var showGuide = false
    @State private var showInject = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // Logo + Title
                VStack(spacing: 12) {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 80, height: 80)
                        .clipShape(RoundedRectangle(cornerRadius: 18))

                    Text("Ch3ss Client")
                        .font(.system(size: 26, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)

                    Text("Safari Web Extension")
                        .font(.system(size: 13, weight: .regular, design: .monospaced))
                        .foregroundColor(Color.white.opacity(0.4))
                }

                // Buttons
                VStack(spacing: 16) {
                    Button(action: { showInject = true }) {
                        HStack {
                            Image(systemName: "arrow.down.circle")
                            Text("Inject")
                                .fontWeight(.semibold)
                        }
                        .font(.system(size: 17, design: .monospaced))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    Button(action: { showGuide = true }) {
                        HStack {
                            Image(systemName: "book")
                            Text("Инструкция")
                                .fontWeight(.semibold)
                        }
                        .font(.system(size: 17, design: .monospaced))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                        )
                    }
                }
                .padding(.horizontal, 32)

                Spacer()

                Text("v1.1 • chess.com")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Color.white.opacity(0.2))
                    .padding(.bottom, 20)
            }
        }
        .sheet(isPresented: $showInject) {
            InjectView()
        }
        .sheet(isPresented: $showGuide) {
            GuideView()
        }
    }
}

// MARK: - Inject Sheet
struct InjectView: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                HStack {
                    Text("Активация расширения")
                        .font(.system(size: 20, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                    Spacer()
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .foregroundColor(.white)
                            .padding(8)
                    }
                }
                .padding(.top, 24)
                .padding(.horizontal, 24)

                VStack(alignment: .leading, spacing: 16) {
                    StepRow(num: "1", text: "Открой Safari и перейди на chess.com")
                    StepRow(num: "2", text: "Нажми кнопку AA (aA) в адресной строке")
                    StepRow(num: "3", text: "Выбери \"Настройки для этого сайта\"")
                    StepRow(num: "4", text: "Перейди в Настройки → Safari → Расширения")
                    StepRow(num: "5", text: "Включи Ch3ss Client и разреши доступ к chess.com")
                    StepRow(num: "6", text: "Расширение активно — иконка появится в Safari")
                }
                .padding(.horizontal, 24)

                Button(action: {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }) {
                    HStack {
                        Image(systemName: "gear")
                        Text("Открыть Настройки")
                    }
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal, 24)

                Spacer()
            }
        }
    }
}

// MARK: - Guide Sheet
struct GuideView: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    HStack {
                        Text("Инструкция")
                            .font(.system(size: 20, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                        Spacer()
                        Button(action: { dismiss() }) {
                            Image(systemName: "xmark")
                                .foregroundColor(.white)
                                .padding(8)
                        }
                    }
                    .padding(.top, 24)
                    .padding(.horizontal, 24)

                    VStack(alignment: .leading, spacing: 20) {
                        SectionHeader(title: "Установка")
                        StepRow(num: "1", text: "Собери IPA через Xcode (нужен Apple Developer аккаунт или AltStore)")
                        StepRow(num: "2", text: "Установи на iPhone через AltStore, Sideloadly или Xcode")
                        StepRow(num: "3", text: "Открой Ch3ss Client и следуй инструкции Inject")

                        SectionHeader(title: "Возможности")
                        FeatureRow(icon: "brain", text: "Автоход — лучший ход Stockfish")
                        FeatureRow(icon: "eye", text: "Оверлей — стрелка лучшего хода")
                        FeatureRow(icon: "person.fill", text: "Режим Human Safe — имитация человека")
                        FeatureRow(icon: "chart.bar", text: "График оценки позиции")
                        FeatureRow(icon: "clock", text: "Автоподбор задержки ответа")

                        SectionHeader(title: "Режимы")
                        InfoBox(text: "Human Safe: случайные ошибки, человеческие задержки\nLegit: более частые ошибки, похоже на реального игрока\nAutowin: максимально быстро, 0 ошибок")

                        SectionHeader(title: "Важно")
                        InfoBox(text: "Расширение работает только на chess.com\nТребуется iOS 16.0 и новее\nПосле обновления Safari — повторно включи расширение")
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                }
            }
        }
    }
}

// MARK: - Reusable Components
struct StepRow: View {
    let num: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.5), lineWidth: 1.5)
                    .frame(width: 28, height: 28)
                Text(num)
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
            }
            Text(text)
                .font(.system(size: 15, design: .monospaced))
                .foregroundColor(Color.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
        }
    }
}

struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .foregroundColor(Color.white.opacity(0.4))
            .padding(.top, 8)
    }
}

struct FeatureRow: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.white)
                .frame(width: 20)
            Text(text)
                .font(.system(size: 14, design: .monospaced))
                .foregroundColor(Color.white.opacity(0.85))
            Spacer()
        }
    }
}

struct InfoBox: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 13, design: .monospaced))
            .foregroundColor(Color.white.opacity(0.7))
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.07))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    ContentView()
}
