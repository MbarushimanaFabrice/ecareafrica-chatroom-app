import 'package:flutter/material.dart';
import 'package:netrack_chatroom/chatroom.dart';
// LaunchScreen and AppTheme are exported via chatroom.dart

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await ChatroomService.initialize(
    apiBaseUrl: const String.fromEnvironment('API_URL',
        defaultValue: 'http://10.0.2.2:3000'),
    firebaseOptions: null,
  );

  runApp(const TestShellApp());
}

class TestShellApp extends StatelessWidget {
  const TestShellApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ECA Chatroom',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const LaunchScreen(),
    );
  }
}
