import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../student/student_login_screen.dart';
import 'teacher_parent_otp_screen.dart';

class TeacherParentLoginScreen extends StatefulWidget {
  const TeacherParentLoginScreen({super.key});

  @override
  State<TeacherParentLoginScreen> createState() =>
      _TeacherParentLoginScreenState();
}

class _TeacherParentLoginScreenState extends State<TeacherParentLoginScreen> {
  final _phoneController    = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isParent     = false;   // false = teacher tab, true = parent tab
  bool _loading      = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    final phone    = _phoneController.text.trim();
    final password = _passwordController.text;

    if (phone.isEmpty) {
      setState(() => _error = 'Please enter your phone number.');
      return;
    }
    if (!_isParent && password.isEmpty) {
      setState(() => _error = 'Please enter your password.');
      return;
    }

    setState(() { _loading = true; _error = null; });

    try {
      if (_isParent) {
        await ApiService.parentRequestOtp(phone);
      } else {
        await ApiService.login(phone, password);
      }

      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => TeacherParentOtpScreen(phone: phone),
        ),
      );
    } catch (e) {
      final msg = e.toString();
      setState(() {
        if (msg.contains('PARENT_NOT_FOUND') || msg.contains('404')) {
          _error = 'Phone number not registered. Contact your school admin.';
        } else if (msg.contains('INVALID_CREDENTIALS') || msg.contains('401')) {
          _error = _isParent
              ? 'Phone number not registered. Contact your school admin.'
              : 'Incorrect phone number or password.';
        } else if (msg.contains('ACCOUNT_INACTIVE')) {
          _error = 'Your account is inactive. Contact your school admin.';
        } else {
          _error = 'Could not connect. Please try again.';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _switchTab(bool toParent) {
    setState(() {
      _isParent = toParent;
      _error = null;
      _phoneController.clear();
      _passwordController.clear();
    });
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
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // ── Branding strip ───────────────────────────────────────────
              Expanded(
                flex: 2,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(8),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'packages/netrack_chatroom/assets/images/logo.png',
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.school_rounded,
                            size: 40,
                            color: AppColors.primaryDark,
                          ),
                        ),
                      ),
                    ).animate().scale(duration: 500.ms, curve: Curves.elasticOut),
                    const SizedBox(height: 10),
                    const Text(
                      'ECareAfrica',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ).animate(delay: 200.ms).fadeIn(),
                  ],
                ),
              ),

              // ── Form card ────────────────────────────────────────────────
              Expanded(
                flex: 5,
                child: Container(
                  width: double.infinity,
                  decoration: const BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                  ),
                  padding: const EdgeInsets.fromLTRB(28, 28, 28, 24),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ── Teacher / Parent toggle ───────────────────────
                        Container(
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          padding: const EdgeInsets.all(4),
                          child: Row(
                            children: [
                              _TabButton(
                                label: 'Teacher',
                                icon: Icons.school_rounded,
                                active: !_isParent,
                                onTap: () => _switchTab(false),
                              ),
                              _TabButton(
                                label: 'Parent',
                                icon: Icons.family_restroom_rounded,
                                active: _isParent,
                                onTap: () => _switchTab(true),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 24),

                        // ── Subtitle ──────────────────────────────────────
                        Text(
                          _isParent
                              ? 'Enter your phone number to receive an OTP'
                              : 'Sign in with your phone and password',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),

                        const SizedBox(height: 20),

                        // ── Phone ─────────────────────────────────────────
                        const Text('Phone Number',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          textInputAction: _isParent
                              ? TextInputAction.done
                              : TextInputAction.next,
                          onSubmitted: _isParent ? (_) => _sendOtp() : null,
                          decoration: const InputDecoration(
                            hintText: '+250 7XX XXX XXX',
                            prefixIcon: Icon(Icons.phone_rounded,
                                color: AppColors.primary),
                          ),
                        ),

                        // ── Password (teacher only) ───────────────────────
                        if (!_isParent) ...[
                          const SizedBox(height: 18),
                          const Text('Password',
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary)),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _passwordController,
                            obscureText: !_showPassword,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _sendOtp(),
                            decoration: InputDecoration(
                              hintText: 'Enter your password',
                              prefixIcon: const Icon(Icons.lock_rounded,
                                  color: AppColors.primary),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _showPassword
                                      ? Icons.visibility_off_rounded
                                      : Icons.visibility_rounded,
                                  color: AppColors.textHint,
                                ),
                                onPressed: () => setState(
                                    () => _showPassword = !_showPassword),
                              ),
                            ),
                          ),
                        ],

                        const SizedBox(height: 10),

                        // ── Student link ──────────────────────────────────
                        GestureDetector(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const StudentLoginScreen(),
                            ),
                          ),
                          child: RichText(
                            text: TextSpan(
                              style: const TextStyle(fontSize: 13),
                              children: [
                                const TextSpan(
                                  text: 'Are you a student? ',
                                  style: TextStyle(color: AppColors.textSecondary),
                                ),
                                TextSpan(
                                  text: 'Click here',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w600,
                                    decoration: TextDecoration.underline,
                                    decorationColor: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),

                        // ── Error ─────────────────────────────────────────
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.error.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                  color: AppColors.error.withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.error_outline,
                                    color: AppColors.error, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(_error!,
                                      style: const TextStyle(
                                          color: AppColors.error, fontSize: 13)),
                                ),
                              ],
                            ),
                          ),
                        ],

                        const SizedBox(height: 28),

                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _loading ? null : _sendOtp,
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                            ),
                            child: _loading
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: AppColors.white),
                                  )
                                : const Text('Send OTP',
                                    style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ).animate(delay: 150.ms).slideY(begin: 0.06, end: 0).fadeIn(),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Teacher / Parent toggle button ────────────────────────────────────────────
class _TabButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  const _TabButton({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? AppColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 16,
                color: active ? Colors.white : AppColors.textSecondary,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: active ? Colors.white : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
