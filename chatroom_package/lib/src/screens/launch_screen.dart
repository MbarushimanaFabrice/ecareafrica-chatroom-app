import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../models/user_context.dart';
import '../providers/threads_provider.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import 'auth/teacher_parent_login_screen.dart';
import 'teacher/teacher_home_screen.dart';
import 'parent/child_selection_screen.dart';
import 'student/student_home_screen.dart';

/// First screen shown when the app opens.
/// Shows the ECareAfrica brand for ~2 s, then routes to login or home.
class LaunchScreen extends StatefulWidget {
  const LaunchScreen({super.key});

  @override
  State<LaunchScreen> createState() => _LaunchScreenState();
}

class _LaunchScreenState extends State<LaunchScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    // Minimum brand display time
    await Future.delayed(const Duration(milliseconds: 2200));
    if (!mounted) return;

    // Try to restore a saved token
    await AuthService.instance.restoreToken();

    if (AuthService.instance.isAuthenticated) {
      try {
        final res = await ApiService.getMe();
        final ctx = UserContext.fromJson(
          Map<String, dynamic>.from(res.data['data'] as Map),
        );
        AuthService.instance.setUserContext(ctx);
        if (!mounted) return;
        _goHome(ctx.role);
        return;
      } catch (_) {
        await AuthService.instance.clearSession();
      }
    }

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const TeacherParentLoginScreen()),
    );
  }

  void _goHome(String role) {
    Widget home;
    if (role == 'teacher') {
      home = ChangeNotifierProvider(
        create: (_) => ThreadsProvider(),
        child: const TeacherHomeScreen(),
      );
    } else if (role == 'parent' || role == 'school_admin') {
      home = ChangeNotifierProvider(
        create: (_) => ThreadsProvider(),
        child: const ChildSelectionScreen(),
      );
    } else {
      home = ChangeNotifierProvider(
        create: (_) => ThreadsProvider(),
        child: const StudentHomeScreen(),
      );
    }
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => home),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.primaryDark, AppColors.primary, Color(0xFF1976D2)],
            stops: [0.0, 0.55, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 3),

              // Logo
              Container(
                width: 130,
                height: 130,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primaryDark.withValues(alpha: 0.45),
                      blurRadius: 40,
                      spreadRadius: 4,
                      offset: const Offset(0, 14),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(12),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.asset(
                    'packages/netrack_chatroom/assets/images/logo.png',
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.school_rounded,
                      size: 68,
                      color: AppColors.primaryDark,
                    ),
                  ),
                ),
              )
                  .animate()
                  .scale(
                    begin: const Offset(0.4, 0.4),
                    end: const Offset(1.0, 1.0),
                    duration: 700.ms,
                    curve: Curves.elasticOut,
                  )
                  .fadeIn(duration: 400.ms),

              const SizedBox(height: 28),

              const Text(
                'ECareAfrica',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ).animate(delay: 250.ms).fadeIn().slideY(begin: 0.2, end: 0),

              const SizedBox(height: 6),

              Text(
                'CHATROOM',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.70),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 4,
                ),
              ).animate(delay: 400.ms).fadeIn(),

              const Spacer(flex: 3),

              // Loading dots
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(3, (i) =>
                  Container(
                    width: 7,
                    height: 7,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.6),
                      shape: BoxShape.circle,
                    ),
                  )
                  .animate(delay: (600 + i * 150).ms)
                  .fadeIn()
                  .then()
                  .animate(onPlay: (c) => c.repeat(reverse: true))
                  .fade(
                    begin: 0.3,
                    end: 1.0,
                    duration: 600.ms,
                    delay: (i * 200).ms,
                  ),
                ),
              ),

              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}
