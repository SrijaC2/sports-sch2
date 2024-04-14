/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
const { request, response } = require("express");
const express = require("express");
const csrf = require("tiny-csrf");
const app = express();
const { Sport, User, Sessions, playerSessions } = require("./models");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
app.use(bodyParser.json());
require("dotenv").config();

const i18next = require("./i18n");
const middleware = require("i18next-http-middleware");
app.use(middleware.handle(i18next));

app.set("view engine", "ejs");
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("shh! some secret string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));

const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const LocalStrategy = require("passport-local");

const flash = require("connect-flash");
app.set("views", path.join(__dirname, "views"));
app.use(flash());

const bcrypt = require("bcrypt");
const sport = require("./models/sport");
const { isIPv6 } = require("net");
const saltRounds = 10;

app.use(
  session({
    secret: "my-super-secret-key-21728172615261563",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { email: username } })
        .then(async function (user) {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch((error) => {
          return done(null, false, {
            message: "Your account doesn't exist, try signing up",
          });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

// Date Localization
function formatDate(dateString) {
  const date = new Date(dateString);
  const locale = i18next.language;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return dateFormatter.format(date);
}

//Time Localization
function formatTime(timeString) {
  const time = new Date(`2000-01-01T${timeString}`);
  const locale = i18next.language;
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  return timeFormatter.format(time);
}

// Error tracking and debugging
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
Sentry.init({
  dsn: process.env.DSN,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(Sentry.Handlers.errorHandler());

app.use(function onError(err, req, res, next) {
  Sentry.captureException(err);
  next(err);
});

app.get("/debug-sentry", function mainHandler(req, res) {
  try {
    throw new Error("My first Sentry error!");
  } catch (err) {
    Sentry.captureException(err);
  }
});

app.post("/set-lang", (req, res) => {
  try {
    const selectedLang = req.body.language;
    i18next.changeLanguage(selectedLang);
    setTimeout(() => {
      console.log("Updated Language", i18next.language);
    }, 500);
    res.redirect(req.get("referer") || "/");
  } catch (error) {
    Sentry.captureException(error);
    console.log(error);
    return res.status(422).json(error);
  }
});

// Generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

async function askGemini(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error making a query to Gemini API:", error);
    return null;
  }
}
async function getDetailswithGemini(question, request) {
  try {
    const currDate = new Date().toISOString();
    const systemPrompt =
      "You are creating a sport sessions in a sports scheduler application. " +
      "Users can provide input in a sentence describing a session of particular sport , potentially including venue,a date and time  explicitly or implicitly (e.g., 'today', 'tomorrow'). " +
      "Your task is to analyze the input sentence, extracting the sport type, date and time if mentioned. " +
      "If a date is provided , include it in the output in the format YYYY-MM-DD" +
      "If a time is provided , include it in the output in the format hh:mm 24hr format" +
      "otherwise, extract the sport type and analyze its urgency to decide on a date and time yourself. " +
      `if exact date is not specified make sure to use the current date is ${currDate} to compute any relative dates.` +
      "The output format should be consistent, sessionName : ,date: ,time: ,venue:" +
      "the example output is sport: Cricket, sessionName: Cricket 1, date: 2024-06-12, time: 19:00, venue: Bangalore" +
      "Return the output in the format 'sport: sessionName : date: time: venue:'. where date must and should be in the format YYYY-MM-DD and time should be in the format 24hr hh:mm" +
      "Important make sure if sport is not specified in prompt return sport: null" +
      "The prompt is:";
    const suggestion = await askGemini(systemPrompt + " " + question);
    if (suggestion) {
      console.log("Response from Gemini API:", suggestion);
      const regex =
        /sport\s*:\s*(.*?),\s*sessionName\s*:\s*(.*?),\s*date\s*:\s*(.*?),\s*time\s*:\s*(.*?),\s*venue\s*:\s*(.*)/;
      const matches = suggestion.match(regex);
      if (matches) {
        const sport = matches[1].trim();
        const sessionName = matches[2].trim();
        const date = matches[3].trim();
        const time = matches[4].trim();
        const venue = matches[5].trim();
        const allSports = await Sport.getSports();
        const foundSport = allSports.find(
          (spt) => spt.dataValues.title === sport
        );
        if (foundSport) {
          const sportId = foundSport.dataValues.id;
          const session = await Sessions.addSession({
            sessionName: sessionName,
            date: date,
            time: time,
            venue: venue,
            playersNeeded: 0,
            userId: request.user.id,
            sportId: sportId,
          });
          await playerSessions.create({
            player_name: `${request.user.firstName} ${request.user.lastName}`,
            player_id: request.user.id,
            session_id: session.id,
          });
        } else {
          console.log("Sport not found.");
          request.flash(
            "error",
            "Sport not found. Add sport to create session"
          );
          return;
        }
      } else {
        console.log("No matches found.");
        request.flash("error", "Give more information about the session");
        return;
      }
    } else {
      console.log("No response received from GeminiAPI");
      console.log("No matches found.");
      request.flash("error", "No response received from GeminiAPI");
      return;
    }
  } catch (error) {
    console.log(error);
  }
}

app.post("/add-natural", async (req, res) => {
  await getDetailswithGemini(req.body.naturalText, req);
  res.redirect("/sport");
});

app.get("/", async (request, response) => {
  if (request.user) {
    return response.redirect("/sport");
  }
  return response.render("index", {
    csrfToken: request.csrfToken(),
  });
});

app.get(
  "/sport",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInUserRole = request.user.role;
    if (i18next.language == "dev") {
      i18next.changeLanguage("en");
    }

    try {
      const allSports = await Sport.getSports();
      const playSessions = await playerSessions.getSessions(request.user.id);
      const sessionIDs = playSessions.map((v) => v.session_id);
      const UserSessions = await Sessions.UserSessions(sessionIDs);
      const allUpcoming = await Sessions.UpSessions(UserSessions);
      //Error
      // allsports1

      if (request.accepts("html")) {
        response.render("sports", {
          allSports,
          role: loggedInUserRole,
          allUpcoming,
          currentLang: i18next.language,
          csrfToken: request.csrfToken(),
          t: i18next.t,
          i18next: i18next,
          currentDate: formatDate(new Date()),
          formatDate,
          formatTime,
        });
      } else {
        response.json({
          allSports,
          allUpcoming,
        });
      }
    } catch (error) {
      Sentry.captureException(error);
      console.log(error);
    }
  }
);

app.post(
  "/sport",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      const sport = await Sport.addSport({
        title: request.body.title,
        userId: request.user.id,
      });
      return response.redirect("/sport");
    } catch (error) {
      Sentry.captureException(error);
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get("/signup", (request, response) => {
  response.render("signup", {
    title: "Signup",
    csrfToken: request.csrfToken(),
    t: i18next.t,
  });
});

app.post("/users", async (request, response) => {
  const hashedPwd = await bcrypt.hash(request.body.password, saltRounds);
  if (request.body.password.length < 8) {
    request.flash("error", "Password length can't less than 8");
    return response.redirect("/signup");
  }
  try {
    const user = await User.create({
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      email: request.body.email,
      role: request.body.role,
      password: hashedPwd,
    });
    request.login(user, (err) => {
      if (err) {
        console.log(err);
      }
      response.redirect("/sport");
    });
  } catch (error) {
    console.log("err", error);
    // request.flash("error", error.errors[0].message);
    return response.redirect("/signup");
  }
});

app.post(
  "/createSession/:sportId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.body.playersNeeded < 0) {
      request.flash("error", "Number of players needed can't less than 0");
      return response.redirect(`/sport/sessions/${request.params.sportId}`);
    }
    try {
      const session = await Sessions.addSession({
        sessionName: request.body.sessionName,
        date: request.body.date,
        time: request.body.time,
        venue: request.body.venue,
        playersNeeded: request.body.playersNeeded,
        userId: request.user.id,
        sportId: request.params.sportId,
      });
      console.log(request.body.date);
      const names = request.body.names;
      const nameArr = names.split(",");
      for (let i = 0; i < nameArr.length; i++) {
        await playerSessions.create({
          player_name: nameArr[i],
          session_id: session.id,
        });
      }
      return response.redirect(`/sport/${request.params.sportId}`);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get("/login", (request, response) => {
  if (request.user) {
    return response.redirect("/sport");
  }
  if (i18next.language == "dev") {
    i18next.changeLanguage("en");
  }
  return response.render("login", {
    title: "Login",
    csrfToken: request.csrfToken(),
    t: i18next.t,
  });
});

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    response.redirect("/sport");
  }
);

app.get("/signout", (request, response, next) => {
  request.logout((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  });
});

app.get(
  "/createSport",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const allSportsPart = await Sport.UsergetSports(request.user.id);
    try {
      response.render("createSpt", {
        csrfToken: request.csrfToken(),
        allSportsPart,
        t: i18next.t,
      });
    } catch (error) {
      console.log(error);
      Sentry.captureException(error);
    }
  }
);

app.get(
  "/sport/:sportId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const sport = await Sport.findByPk(request.params.sportId);
    const allSessionPart = await Sessions.UsergetSession(
      request.user.id,
      request.params.sportId
    );
    const allSportSessions = await Sessions.SportSessions(
      request.params.sportId
    );
    let allUpcoming = await Sessions.UpSessions(allSportSessions);
    allUpcoming = await Sessions.UncancelSess(allUpcoming);
    const userRole = request.user.role;
    if (request.accepts("html")) {
      try {
        response.render("ParticularSpt", {
          title: sport.title,
          sport,
          allSessionPart,
          allUpcoming,
          userRole,
          csrfToken: request.csrfToken(),
        });
      } catch (error) {
        console.log(error);
      }
    } else {
      response.json({
        allSessionPart,
        allUpcoming,
        sport,
      });
    }
  }
);

app.get(
  "/sport/sessions/:sportId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const sport = await Sport.findByPk(request.params.sportId);
    try {
      response.render("createSession", {
        title: sport.title,
        sport,
        csrfToken: request.csrfToken(),
      });
    } catch (error) {
      console.log(error);
    }
  }
);

app.delete(
  "/sport/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      const session = await Sessions.SportSessions(request.params.id);
      const sessionIDs = session.map((v) => v.id);
      await playerSessions.deleteSession(sessionIDs);
      await Sessions.deleteSession(request.params.id);
      await Sport.remove(request.params.id);
      return response.json({ success: true });
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get(
  "/sport/edit/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const sport = await Sport.findByPk(request.params.id);
    try {
      response.render("editSport", {
        csrfToken: request.csrfToken(),
        sport,
      });
    } catch (error) {
      console.log(error);
    }
  }
);

app.post(
  "/sport/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const sport = await Sport.findByPk(request.params.id);
    try {
      const updatedSport = await Sport.setTitle(request.body.title, sport);
      return response.redirect(`/sport/${request.params.id}`);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get(
  "/sport/partSession/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const Session = await Sessions.findByPk(request.params.id);
    const Players = await playerSessions.getPlayers(Session.id);
    const userId = request.user.id;
    const cs = request.csrfToken();
    if (request.accepts("html")) {
      try {
        response.render("particularSession", {
          title: Session.sessionName,
          Session,
          Players,
          userId,
          csrfToken: request.csrfToken(),
        });
      } catch (error) {
        console.log(error);
        Sentry.captureException(error);
      }
    } else {
      response.json({
        Players,
        cs,
        Session,
      });
    }
  }
);

app.delete(
  "/playerSession/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      const playerRecord = await playerSessions.findByPk(request.params.id);
      const Session = await Sessions.findByPk(playerRecord.session_id);
      await playerSessions.remove(request.params.id);
      await Sessions.incPlayerCount(Session);
      return response.json({ success: true });
    } catch (error) {
      console.log(error);
      Sentry.captureException(err);
      return response.status(422).json(error);
    }
  }
);

app.post(
  "/playerSession/player/:sessionId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response, next) => {
    const userId = request.user.id;
    try {
      const Session = await Sessions.findByPk(request.params.sessionId);
      await playerSessions.create({
        player_name: `${request.user.firstName} ${request.user.lastName}`,
        player_id: userId,
        session_id: request.params.sessionId,
      });
      await Sessions.decPlayerCount(Session);
      return response.redirect(
        `/sport/partSession/${request.params.sessionId}`
      );
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.delete(
  "/playerSession/player/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      const Session = await Sessions.findByPk(request.params.id);
      await playerSessions.removeById(request.params.id, request.user.id);
      await Sessions.incPlayerCount(Session);
      return response.json({ success: true });
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get(
  "/sport/partSession/editSession/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const Session = await Sessions.findByPk(request.params.id);
    const sport = await Sport.findByPk(Session.sportId);
    try {
      const Players = await playerSessions.getPlayers(Session.id);
      const mapped = Players.map((v) => v.player_name);
      const names = mapped.join(",");
      response.render("editSession", {
        csrfToken: request.csrfToken(),
        Session,
        names,
        sport,
      });
    } catch (error) {
      console.log(error);
    }
  }
);

app.post(
  "/editSession/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.body.playersNeeded < 0) {
      request.flash("error", "Number of players needed can't less than 0");
      return response.redirect(
        `/sport/partSession/editSession/${request.params.id}`
      );
    }
    try {
      const Session = await Sessions.findByPk(request.params.id);
      const newSession = await Sessions.editSession({
        Session1: Session,
        sessionName: request.body.sessionName,
        date: request.body.date,
        time: request.body.time,
        venue: request.body.venue,
        playersNeeded: request.body.playersNeeded,
      });
      const Players = await playerSessions.getPlayers(Session.id);
      await playerSessions.deleteSession(request.params.id);
      const names = request.body.names;
      const nameArr = names.split(",");
      for (let i = 0; i < nameArr.length; i++) {
        let value = false;
        for (let j = 0; j < Players.length; j++) {
          if (Players[j].player_name === nameArr[i]) {
            await playerSessions.addPlayers({
              player_name: nameArr[i],
              session_id: newSession.id,
              player_id: Players[j].player_id,
            });
            value = true;
            break;
          }
        }
        if (value === false) {
          await playerSessions.create({
            player_name: nameArr[i],
            session_id: newSession.id,
          });
        }
      }
      return response.redirect(`/sport/partSession/${request.params.id}`);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get(
  "/sport/partSession/cancel/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const Session = await Sessions.findByPk(request.params.id);
    const sport = await Sport.findByPk(Session.sportId);
    try {
      response.render("cancelSession", {
        csrfToken: request.csrfToken(),
        Session,
        sport,
      });
    } catch (error) {
      console.log(error);
    }
  }
);

app.post(
  "/cancel/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      const Session = await Sessions.findByPk(request.params.id);
      const CancelSession = await Session.update({
        canceled: true,
        message: request.body.message,
      });
      return response.redirect(`/sport/${Session.sportId}`);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get(
  "/sport/viewPreSessions/:sportId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const sport = await Sport.findByPk(request.params.sportId);
    const allSportSessions = await Sessions.SportSessions(
      request.params.sportId
    );
    const allPrevious = await Sessions.PrevSessions(allSportSessions);
    if (request.accepts("html")) {
      try {
        response.render("prevSession", {
          csrfToken: request.csrfToken(),
          sport,
          allPrevious,
        });
      } catch (error) {
        console.log(error);
      }
    } else {
      response.json({
        allPrevious,
      });
    }
  }
);

app.get(
  "/viewReports",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    try {
      response.render("viewReports", {
        csrfToken: request.csrfToken(),
      });
    } catch (error) {
      console.log(error);
    }
  }
);

let NoOfSess, reports, Date1, Date2;
app.post(
  "/viewReports",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (new Date(request.body.date1) >= new Date(request.body.date2)) {
      request.flash("error", "Enter Valid Range");
      return response.redirect("/viewReports");
    }
    try {
      const allsessions = await Sessions.getUncancelSess();
      Date1 = request.body.date1;
      Date2 = request.body.date2;
      const sessions = await Sessions.findRange(
        allsessions,
        request.body.date1,
        request.body.date2
      );
      NoOfSess = sessions.length;
      let sportIDs = sessions.map((v) => v.sportId);
      sportIDs = new Set(sportIDs);
      sportIDs = Array.from(sportIDs);
      reports = [];
      for (let i = 0; i < sportIDs.length; i++) {
        const counter = await Sessions.count(sessions, sportIDs[i]);
        const sport = await Sport.findByPk(sportIDs[i]);
        const obj = {
          sportId: sportIDs[i],
          sportName: sport.title,
          count: counter,
        };
        reports.push(obj);
      }
      response.redirect("/viewReportsResult");
    } catch (error) {
      console.log(error);
    }
  }
);

app.get(
  "/viewReportsResult",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.accepts("html")) {
      try {
        reports.sort((a, b) => b.count - a.count);
        response.render("viewReportsResult", {
          NoOfSess,
          reports,
          Date1,
          Date2,
          csrfToken: request.csrfToken(),
        });
      } catch (error) {
        console.log(error);
      }
    } else {
      response.json({
        NoOfSess,
      });
    }
  }
);
module.exports = app;
