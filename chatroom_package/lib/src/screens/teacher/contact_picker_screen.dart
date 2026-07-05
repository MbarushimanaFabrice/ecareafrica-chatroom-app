import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../models/chat_thread.dart';
import '../../models/user_context.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../theme/app_theme.dart';
import '../chat_thread_screen.dart';

/// Contact picker for teachers — lists students and their parents
/// so the teacher can initiate a direct chat.
class ContactPickerScreen extends StatefulWidget {
  const ContactPickerScreen({super.key});

  @override
  State<ContactPickerScreen> createState() => _ContactPickerScreenState();
}

class _ContactPickerScreenState extends State<ContactPickerScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';
  String? _openingId; // tracks which contact is loading

  List<TeacherStudentInfo> get _students {
    final ctx = AuthService.instance.userContext;
    return ctx?.students ?? [];
  }

  /// Unique parents derived from the students list.
  List<_ParentEntry> get _parents {
    final seen = <String>{};
    final result = <_ParentEntry>[];
    for (final s in _students) {
      final pid = s.parentUserId;
      if (pid != null && pid.isNotEmpty && !seen.contains(pid)) {
        seen.add(pid);
        result.add(_ParentEntry(
          parentUserId: pid,
          parentName: s.parentName ?? 'Parent',
          studentName: s.fullName,
          studentId: s.studentId,
          sectionId: s.sectionId,
        ));
      }
    }
    return result;
  }

  List<TeacherStudentInfo> get _filteredStudents {
    if (_query.isEmpty) return _students;
    return _students.where((s) =>
        s.fullName.toLowerCase().contains(_query) ||
        s.admissionNumber.toLowerCase().contains(_query) ||
        s.section.toLowerCase().contains(_query)).toList();
  }

  List<_ParentEntry> get _filteredParents {
    if (_query.isEmpty) return _parents;
    return _parents.where((p) =>
        p.parentName.toLowerCase().contains(_query) ||
        p.studentName.toLowerCase().contains(_query)).toList();
  }

  Future<void> _openStudentThread(TeacherStudentInfo student) async {
    setState(() => _openingId = 'student_${student.studentId}');
    await _createAndOpen(
      teacherId: AuthService.instance.userContext!.userId,
      studentId: student.studentId,
      parentId: null,
      initiator: 'student',
    );
    if (mounted) setState(() => _openingId = null);
  }

  Future<void> _openParentThread(_ParentEntry parent) async {
    setState(() => _openingId = 'parent_${parent.parentUserId}');
    await _createAndOpen(
      teacherId: AuthService.instance.userContext!.userId,
      studentId: parent.studentId,
      parentId: parent.parentUserId,
      initiator: 'parent',
    );
    if (mounted) setState(() => _openingId = null);
  }

  Future<void> _createAndOpen({
    required String teacherId,
    required String studentId,
    String? parentId,
    required String initiator,
  }) async {
    try {
      final res = await ApiService.createThread({
        'teacher_id': teacherId,
        'student_id': studentId,
        if (parentId != null) 'parent_id': parentId,
        'thread_type': 'direct',
        'thread_initiator': initiator,
      });
      final thread = ChatThread.fromJson(
        Map<String, dynamic>.from(res.data['data'] as Map),
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ChatThreadScreen(thread: thread)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not open chat: ${e.toString()}'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('New Message',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: Column(
        children: [
          // Search bar
          Container(
            color: AppColors.primaryDark,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchController,
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search by name or roll number…',
                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                prefixIcon: Icon(Icons.search,
                    color: Colors.white.withValues(alpha: 0.7)),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
          ),

          Expanded(
            child: _students.isEmpty
                ? const Center(
                    child: Text(
                      'No contacts found.\nYour student assignments will appear here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      // ── Students section ───────────────────────────────
                      if (_filteredStudents.isNotEmpty) ...[
                        _SectionHeader(
                          icon: Icons.badge_rounded,
                          label: 'Students (${_filteredStudents.length})',
                        ),
                        ..._filteredStudents.asMap().entries.map((e) =>
                            _ContactTile(
                              avatarLabel: e.value.fullName[0],
                              avatarColor: AppColors.primary,
                              title: e.value.fullName,
                              subtitle:
                                  '${e.value.section}  •  ${e.value.admissionNumber}',
                              trailing: e.value.subjects.join(', '),
                              isLoading:
                                  _openingId == 'student_${e.value.studentId}',
                              onTap: () => _openStudentThread(e.value),
                            ).animate(delay: (e.key * 40).ms).fadeIn().slideX(
                                begin: 0.04, end: 0)),
                      ],

                      // ── Parents section ────────────────────────────────
                      if (_filteredParents.isNotEmpty) ...[
                        _SectionHeader(
                          icon: Icons.family_restroom_rounded,
                          label: 'Parents (${_filteredParents.length})',
                        ),
                        ..._filteredParents.asMap().entries.map((e) =>
                            _ContactTile(
                              avatarLabel: e.value.parentName[0],
                              avatarColor: const Color(0xFF00897B),
                              title: e.value.parentName,
                              subtitle: 'Parent of ${e.value.studentName}',
                              trailing: '',
                              isLoading:
                                  _openingId == 'parent_${e.value.parentUserId}',
                              onTap: () => _openParentThread(e.value),
                            ).animate(delay: (e.key * 40).ms).fadeIn().slideX(
                                begin: 0.04, end: 0)),
                      ],

                      if (_filteredStudents.isEmpty && _filteredParents.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(
                            child: Text('No results match your search.',
                                style:
                                    TextStyle(color: AppColors.textSecondary)),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ParentEntry {
  final String parentUserId;
  final String parentName;
  final String studentName;
  final String studentId;
  final String sectionId;

  const _ParentEntry({
    required this.parentUserId,
    required this.parentName,
    required this.studentName,
    required this.studentId,
    required this.sectionId,
  });
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  const _SectionHeader({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.primary),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  final String avatarLabel;
  final Color avatarColor;
  final String title;
  final String subtitle;
  final String trailing;
  final bool isLoading;
  final VoidCallback onTap;

  const _ContactTile({
    required this.avatarLabel,
    required this.avatarColor,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.isLoading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: CircleAvatar(
        backgroundColor: avatarColor.withValues(alpha: 0.15),
        child: Text(
          avatarLabel.toUpperCase(),
          style: TextStyle(
              color: avatarColor, fontWeight: FontWeight.w700, fontSize: 16),
        ),
      ),
      title: Text(title,
          style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
              fontSize: 15)),
      subtitle: Text(subtitle,
          style: const TextStyle(
              color: AppColors.textSecondary, fontSize: 12)),
      trailing: isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child:
                  CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
            )
          : trailing.isNotEmpty
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySurface,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(trailing,
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w500)),
                )
              : const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textHint),
      onTap: isLoading ? null : onTap,
    );
  }
}
