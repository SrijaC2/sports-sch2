const app = require("./app");

app.listen(3000, () => {
  console.log("Started express server at port 3000");
});

console.log("I am from branch 2");
