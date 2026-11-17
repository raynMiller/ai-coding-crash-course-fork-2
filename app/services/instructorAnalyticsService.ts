import { eq, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  courseRatings,
  quizAttempts,
  quizzes,
  lessons,
  modules,
} from "~/db/schema";

// ─── Instructor Analytics Service ───
// Provides analytics data for instructor dashboard.
// Uses positional parameters (project convention).

// Revenue share configuration (70% to instructor, 30% to platform)
export const INSTRUCTOR_REVENUE_SHARE = 0.7;

// ─── Overview Data ───

export interface InstructorOverview {
  totalRevenue: number;
  totalStudents: number;
  averageRating: number | null;
  averageQuizPassRate: number | null;
}

export function getInstructorOverview(instructorId: number): InstructorOverview {
  // Get instructor's course IDs
  const instructorCourses = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  const courseIds = instructorCourses.map((c) => c.id);

  if (courseIds.length === 0) {
    return {
      totalRevenue: 0,
      totalStudents: 0,
      averageRating: null,
      averageQuizPassRate: null,
    };
  }

  // Calculate total revenue (with instructor share)
  const purchasesList = db
    .select({ amountPaid: purchases.amountPaid })
    .from(purchases)
    .where(inArray(purchases.courseId, courseIds))
    .all();

  const totalRevenue =
    purchasesList.reduce((sum, p) => sum + p.amountPaid, 0) *
    INSTRUCTOR_REVENUE_SHARE;

  // Count total students (unique enrollments across all courses)
  const enrollmentsList = db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(inArray(enrollments.courseId, courseIds))
    .all();

  const uniqueStudents = new Set(enrollmentsList.map((e) => e.userId));
  const totalStudents = uniqueStudents.size;

  // Calculate average rating across all courses
  const ratingsList = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .all();

  const averageRating =
    ratingsList.length > 0
      ? ratingsList.reduce((sum, r) => sum + r.rating, 0) / ratingsList.length
      : null;

  // Calculate average quiz first-attempt pass rate
  // Get all modules for instructor's courses
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(inArray(modules.courseId, courseIds))
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  if (moduleIds.length === 0) {
    return {
      totalRevenue,
      totalStudents,
      averageRating,
      averageQuizPassRate: null,
    };
  }

  // Get lessons for these modules
  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(inArray(lessons.moduleId, moduleIds))
    .all();

  const lessonIds = courseLessons.map((l) => l.id);

  if (lessonIds.length === 0) {
    return {
      totalRevenue,
      totalStudents,
      averageRating,
      averageQuizPassRate: null,
    };
  }

  // Get quizzes for these lessons
  const courseQuizzes = db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(inArray(quizzes.lessonId, lessonIds))
    .all();

  const quizIds = courseQuizzes.map((q) => q.id);

  let averageQuizPassRate: number | null = null;

  if (quizIds.length > 0) {
    // Get all attempts for these quizzes
    const attempts = db
      .select({
        userId: quizAttempts.userId,
        quizId: quizAttempts.quizId,
        passed: quizAttempts.passed,
        attemptedAt: quizAttempts.attemptedAt,
      })
      .from(quizAttempts)
      .where(inArray(quizAttempts.quizId, quizIds))
      .all();

    if (attempts.length > 0) {
      // Group by user-quiz and find first attempt
      const firstAttempts = new Map<string, boolean>();
      const attemptsByUserQuiz = new Map<string, typeof attempts>();

      attempts.forEach((attempt) => {
        const key = `${attempt.userId}-${attempt.quizId}`;
        if (!attemptsByUserQuiz.has(key)) {
          attemptsByUserQuiz.set(key, []);
        }
        attemptsByUserQuiz.get(key)!.push(attempt);
      });

      attemptsByUserQuiz.forEach((userQuizAttempts, key) => {
        const sorted = userQuizAttempts.sort(
          (a, b) =>
            new Date(a.attemptedAt).getTime() -
            new Date(b.attemptedAt).getTime()
        );
        firstAttempts.set(key, sorted[0].passed);
      });

      const passedCount = Array.from(firstAttempts.values()).filter(
        (passed) => passed
      ).length;
      averageQuizPassRate = (passedCount / firstAttempts.size) * 100;
    }
  }

  return {
    totalRevenue,
    totalStudents,
    averageRating,
    averageQuizPassRate,
  };
}

// ─── Course Analytics ───

export interface CourseAnalytics {
  courseId: number;
  courseName: string;
  studentCount: number;
  revenue: number;
  completionRate: number | null;
  averageRating: number | null;
  quizPassRate: number | null;
  averageCompletionDays: number | null;
}

export function getInstructorCourseAnalytics(
  instructorId: number
): CourseAnalytics[] {
  const instructorCourses = db
    .select()
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  return instructorCourses.map((course) => {
    // Student count
    const enrollmentsList = db
      .select()
      .from(enrollments)
      .where(eq(enrollments.courseId, course.id))
      .all();

    const studentCount = enrollmentsList.length;

    // Revenue (with instructor share)
    const purchasesList = db
      .select({ amountPaid: purchases.amountPaid })
      .from(purchases)
      .where(eq(purchases.courseId, course.id))
      .all();

    const revenue =
      purchasesList.reduce((sum, p) => sum + p.amountPaid, 0) *
      INSTRUCTOR_REVENUE_SHARE;

    // Completion rate
    let completionRate: number | null = null;
    if (studentCount > 0) {
      const completedCount = enrollmentsList.filter(
        (e) => e.completedAt !== null
      ).length;
      completionRate = (completedCount / studentCount) * 100;
    }

    // Average rating
    const ratingsList = db
      .select({ rating: courseRatings.rating })
      .from(courseRatings)
      .where(eq(courseRatings.courseId, course.id))
      .all();

    const averageRating =
      ratingsList.length > 0
        ? ratingsList.reduce((sum, r) => sum + r.rating, 0) / ratingsList.length
        : null;

    // Quiz pass rate (first attempt)
    // Get modules for this course
    const courseModules = db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, course.id))
      .all();

    const moduleIds = courseModules.map((m) => m.id);

    let quizPassRate: number | null = null;

    if (moduleIds.length > 0) {
      // Get lessons for these modules
      const courseLessons = db
        .select({ id: lessons.id })
        .from(lessons)
        .where(inArray(lessons.moduleId, moduleIds))
        .all();

      const lessonIds = courseLessons.map((l) => l.id);

      if (lessonIds.length > 0) {
        // Get quizzes for these lessons
        const courseQuizzes = db
          .select({ id: quizzes.id })
          .from(quizzes)
          .where(inArray(quizzes.lessonId, lessonIds))
          .all();

        const quizIds = courseQuizzes.map((q) => q.id);

        if (quizIds.length > 0) {
          // Get all attempts
          const attempts = db
            .select({
              userId: quizAttempts.userId,
              quizId: quizAttempts.quizId,
              passed: quizAttempts.passed,
              attemptedAt: quizAttempts.attemptedAt,
            })
            .from(quizAttempts)
            .where(inArray(quizAttempts.quizId, quizIds))
            .all();

          if (attempts.length > 0) {
            // Group by user-quiz and find first attempt
            const firstAttempts = new Map<string, boolean>();
            const attemptsByUserQuiz = new Map<string, typeof attempts>();

            attempts.forEach((attempt) => {
              const key = `${attempt.userId}-${attempt.quizId}`;
              if (!attemptsByUserQuiz.has(key)) {
                attemptsByUserQuiz.set(key, []);
              }
              attemptsByUserQuiz.get(key)!.push(attempt);
            });

            attemptsByUserQuiz.forEach((userQuizAttempts) => {
              const sorted = userQuizAttempts.sort(
                (a, b) =>
                  new Date(a.attemptedAt).getTime() -
                  new Date(b.attemptedAt).getTime()
              );
              const key = `${sorted[0].userId}-${sorted[0].quizId}`;
              firstAttempts.set(key, sorted[0].passed);
            });

            const passedCount = Array.from(firstAttempts.values()).filter(
              (passed) => passed
            ).length;
            quizPassRate = (passedCount / firstAttempts.size) * 100;
          }
        }
      }
    }

    // Average completion days
    let averageCompletionDays: number | null = null;
    const completedEnrollments = enrollmentsList.filter(
      (e) => e.completedAt !== null
    );

    if (completedEnrollments.length > 0) {
      const totalDays = completedEnrollments.reduce((sum, enrollment) => {
        const enrolled = new Date(enrollment.enrolledAt);
        const completed = new Date(enrollment.completedAt!);
        const days = Math.floor(
          (completed.getTime() - enrolled.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + days;
      }, 0);

      averageCompletionDays = Math.round(totalDays / completedEnrollments.length);
    }

    return {
      courseId: course.id,
      courseName: course.title,
      studentCount,
      revenue,
      completionRate,
      averageRating,
      quizPassRate,
      averageCompletionDays,
    };
  });
}
