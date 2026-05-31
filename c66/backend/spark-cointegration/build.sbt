name := "spark-cointegration"
version := "1.0"
scalaVersion := "2.12.18"

libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-sql" % "3.5.0" % "provided",
  "org.apache.spark" %% "spark-mllib" % "3.5.0" % "provided",
  "org.apache.commons" % "commons-math3" % "3.6.1",
  "redis.clients" % "jedis" % "4.4.3",
  "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.15.2"
)
