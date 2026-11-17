import type { Route } from "./+types/instructor.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import { data } from "react-router";
import { UserRole } from "~/db/schema";
import {
  getInstructorOverview,
  getInstructorCourseAnalytics,
} from "~/services/instructorAnalyticsService";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DollarSign, Users, Star, Award, TrendingUp } from "lucide-react";
import { useState } from "react";

export function meta() {
  return [
    { title: "Analytics — Cadence" },
    { name: "description", content: "View your course analytics" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view analytics.", {
      status: 401,
    });
  }

  const user = getUserById(currentUserId);

  if (!user || user.role !== UserRole.Instructor) {
    throw data("Only instructors can access this page.", {
      status: 403,
    });
  }

  const overview = getInstructorOverview(currentUserId);
  const courseAnalytics = getInstructorCourseAnalytics(currentUserId);

  return { overview, courseAnalytics };
}

type SortKey =
  | "courseName"
  | "studentCount"
  | "revenue"
  | "completionRate"
  | "averageRating"
  | "quizPassRate"
  | "averageCompletionDays";

type SortDirection = "asc" | "desc";

export default function InstructorAnalytics({ loaderData }: Route.ComponentProps) {
  const { overview, courseAnalytics } = loaderData;
  const [sortKey, setSortKey] = useState<SortKey>("courseName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedCourses = [...courseAnalytics].sort((a, b) => {
    const aValue = a[sortKey];
    const bValue = b[sortKey];

    // Handle null values (push to end)
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    // Compare values
    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatPercentage = (value: number | null) => {
    if (value === null) return "—";
    return `${value.toFixed(1)}%`;
  };

  const formatDays = (days: number | null) => {
    if (days === null) return "—";
    return `${days} 天`;
  };

  const SortableHeader = ({
    label,
    sortKey: key,
  }: {
    label: string;
    sortKey: SortKey;
  }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === key && (
          <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </TableHead>
  );

  // Empty state
  if (courseAnalytics.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="mb-8 text-3xl font-bold">讲师分析</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">还没有课程</h2>
            <p className="mb-4 text-muted-foreground">
              创建您的第一门课程开始查看分析数据
            </p>
            <a
              href="/instructor/courses/new"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              创建课程
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="mb-8 text-3xl font-bold">讲师分析</h1>

      {/* Overview Cards */}
      <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总收入</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(overview.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">70% 讲师分成</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总学生数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalStudents}</div>
            <p className="text-xs text-muted-foreground">跨所有课程</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均评分</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview.averageRating !== null
                ? overview.averageRating.toFixed(1)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">满分 5.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">测验通过率</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercentage(overview.averageQuizPassRate)}
            </div>
            <p className="text-xs text-muted-foreground">首次尝试</p>
          </CardContent>
        </Card>
      </div>

      {/* Course Analytics Table */}
      <Card>
        <CardHeader>
          <CardTitle>课程详情</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="课程名称" sortKey="courseName" />
                  <SortableHeader label="学生数" sortKey="studentCount" />
                  <SortableHeader label="收入" sortKey="revenue" />
                  <SortableHeader label="完成率" sortKey="completionRate" />
                  <SortableHeader label="评分" sortKey="averageRating" />
                  <SortableHeader label="测验通过率" sortKey="quizPassRate" />
                  <SortableHeader
                    label="平均完课天数"
                    sortKey="averageCompletionDays"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCourses.map((course) => (
                  <TableRow key={course.courseId}>
                    <TableCell className="font-medium">
                      {course.courseName}
                    </TableCell>
                    <TableCell>{course.studentCount}</TableCell>
                    <TableCell>{formatCurrency(course.revenue)}</TableCell>
                    <TableCell>{formatPercentage(course.completionRate)}</TableCell>
                    <TableCell>
                      {course.averageRating !== null
                        ? course.averageRating.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {course.quizPassRate !== null
                        ? formatPercentage(course.quizPassRate)
                        : "无测验"}
                    </TableCell>
                    <TableCell>{formatDays(course.averageCompletionDays)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
