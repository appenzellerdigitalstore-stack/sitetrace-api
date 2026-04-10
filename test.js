const axios = require('axios');

axios.get('https://example.com')
.then(res => {
console.log("SUCCESS");
console.log(res.status);
})
.catch(err => {
console.log("ERROR");
console.log(err.message);
});
