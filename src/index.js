import { Buffer } from 'buffer';
const PostalMime = require('postal-mime');

export default {
	async email(message, env, ctx) {
		const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
		const parser = new PostalMime.default();
		const parsedEmail = await parser.parse(rawEmail);
    if (env.ENABLE_LOGS) {
      console.log("Logging has been enabled. Change env.ENABLE_LOGS to false to hide these messages.");
  		console.log("Mail subject: ", parsedEmail.subject);
      console.log("Message.to: " + message.to);
      console.log("Message.from: " + message.from);
  		console.log("HTML version of Email: ", parsedEmail.html);
  		console.log("Text version of Email: ", parsedEmail.text);
      console.log("Message ID: " + parsedEmail.messageId);
      console.log("In Reply To: " + parsedEmail.inReplyTo);
      console.log("References: " + parsedEmail.references);

  		if (parsedEmail.attachments.length == 0) {
  			console.log("No attachments");
  		} else {
  			parsedEmail.attachments.forEach(att => {
  				console.log("Attachment: ", att.filename);
  				console.log("Attachment disposition: ", att.disposition);
  				console.log("Attachment mime type: ", att.mimeType);
  				console.log("Attachment size: ", att.content.byteLength);
  			});
  		}
    }

    const blocklist = env.BLOCKED ?? [];
    const isBlocked = blocklist.indexOf(message.from) > -1;
    const hideList = env.HIDE_ADDRESSES ?? [];
    const shouldHide = hideList.indexOf(message.from) > -1;

    if (isBlocked) {
      if (env.ENABLE_LOGS) {
        console.log("Address " + message.from + " is blocked, will drop message");
      }
      message.setReject("Address is blocked");
    } else if (shouldHide) {
      const {toEmail, fromEmail, toName, fromName} = parseAddress(message.to, env);
      if (env.ENABLE_LOGS) {
        console.log("Message sender in env.HIDE_ADDRESSES. Sending from " + fromEmail + " to " + toEmail);
      }
      ctx.waitUntil(sendEmailWithMailjet(fromEmail, fromName, toEmail, toName, message, env, parsedEmail));
    } else {
      const forwardTo = env.FORWARD_TO
      if (env.ENABLE_LOGS) {
        console.log("Forwarding inbound message to env.FORWARD_TO: " + forwardTo);
      }
      if (env.FORWARD_FROM_CLOUDFLARE) {
        await message.forward(forwardTo);
      } else {
        const fromEmail = createAlias(parsedEmail, env);
        const fromName = parsedEmail.from.name;
        const toEmail = env.FORWARD_TO;
        const toName = '';
        ctx.waitUntil(sendEmailWithMailjet(fromEmail, fromName, toEmail, toName, message, env, parsedEmail));
      }
    }
	},
};

async function streamToArrayBuffer(stream, streamSize) {
  // Thanks to https://github.com/edevil/email_worker_parser/blob/main/src/index.js
	let result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

function createAlias(parsedEmail, env) {
  var fromName = null;
  var fromDomain = null;
  var fromUsername = null;
  const myDomains = env.MY_DOMAINS;
  for (let parsedEmailIndex = 0; parsedEmailIndex < parsedEmail.to.length; parsedEmailIndex++) {
    for (let domainIndex = 0; domainIndex < myDomains.length; domainIndex++) {
      const parsedToAddress = parsedEmail.to[parsedEmailIndex].address;
      const parsedToDomain = parsedToAddress.substring(parsedToAddress.lastIndexOf('@') + 1, parsedToAddress.count)
      if (myDomains[domainIndex] == parsedToDomain) {
        fromName = parsedEmail.to[parsedEmailIndex].name.replace(' ', '_'); // parsedEmail.to[].name is decoded name (empty string if not set)
        fromDomain = parsedToDomain;
        fromUsername = parsedToAddress.substring(0, parsedToAddress.indexOf('@'));
        break;
      }
    }
  }

  if (fromDomain == null || fromUsername == null) {
    fromAlias = env.DEFAULT_ALIAS;
    fromDomain = fromAlias.substring(fromAlias.lastIndexOf('@') + 1, fromAlias.count)
    fromUsername = fromAlias.substring(0, fromAlias.indexOf('@'));
  }

  const toName = parsedEmail.from.name.replace(' ', '_');
  const toEmail = parsedEmail.from.address;
  const toUsername = toEmail.substring(0, toEmail.indexOf('@'));
  const toDomain = toEmail.substring(toEmail.lastIndexOf('@') + 1, toEmail.count)

  let alias = fromUsername;
  if (fromName) {
    alias += `{${fromName}}`;
  }
  alias += `+${toUsername}{${toName}}=${toDomain}@${fromDomain}`;

  if (env.ENABLE_LOGS) {
    console.log("Created alias: ", alias);
  }

  return alias;
}

function parseAddress(email, env) {
  var toName = '';
  var fromName = '';
  var toUsername;
  var fromUsername;
  const fromSubstring = email.substring(0, email.indexOf('+'));
  const fromDomain = email.substring(email.lastIndexOf('@'), email.count);
  const toSubstring = email.substring(email.indexOf('+') + 1, email.lastIndexOf('@')).replace('=', '@');
  const toDomain = toSubstring.substring(toSubstring.lastIndexOf('@'), toSubstring.length);
  const toUserSubstring = toSubstring.substring(0, toSubstring.lastIndexOf(toDomain));

  if (fromSubstring.indexOf('{') > -1 && fromSubstring.indexOf('}') == fromSubstring.length - 1) {
      fromName = fromSubstring.substring(fromSubstring.lastIndexOf('{') + 1, fromSubstring.lastIndexOf('}'));
      fromUsername = fromSubstring.substring(0, fromSubstring.indexOf(fromName) - 1);
      fromName = fromName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  } else {
      fromName = env.DEFAULT_FROM_NAME ?? '';
      fromUsername = email.substring(0, email.indexOf('+'));
  }

  if (toUserSubstring.indexOf('{') > -1 && toUserSubstring.indexOf('}') == toUserSubstring.length - 1) {
      toName = toUserSubstring.substring(toUserSubstring.indexOf('{') + 1, toUserSubstring.lastIndexOf('}'));
      toUsername = toUserSubstring.substring(0, toUserSubstring.indexOf(toName) - 1);
      toName = toName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  } else {
      toUsername = toUserSubstring;
  }

  const fromEmail = fromUsername + fromDomain;
  const toEmail = toUsername + toDomain;

  if (env.ENABLE_LOGS) {
    console.log("original: " + email); // myfakeusername{my_fake_name}+spammerusername{firstName_lastName}=spamdomain.com@mycustomdomain.com or myfakeusername+spammerusername=spamdomain.com@mycustomdomain.com
    console.log("To Name: " + toName); // {firstName_lastName} = Firstname Lastname. or ''
    console.log("To Substring: " + toSubstring); // spammerusername{firstName_lastName}@spamdomain.com or spammerusername@spamdomain.com
    console.log("To UserSubstring: " + toUserSubstring); // spammerusername{firstName_lastName} or spammerusername
    console.log("To Domain: " + toDomain); // @spamdomain.com
    console.log("To Username: " + toUsername); // spammerusername
    console.log("Formatted To: " + toEmail); // spammerusername@spamdomain.com
    console.log("From Name: " + fromName); // // {my_fake_name} = My Fake Name. or ''
    console.log("From Substring: " + fromSubstring); // myfakeusername{my_fake_name} or myfakeusername
    console.log("From Username: " + fromUsername); // myfakeusername
    console.log("From Domain: " + fromDomain); // @mycustomdomain.com
    console.log("Formatted From: " + fromEmail); // myfakeusername@mycustomdomain.com
  }

  return {toEmail: toEmail, fromEmail: fromEmail, toName: toName, fromName: fromName};
}

function getBcc(env, message) {
  let bcc = [];

  const bccAddresses = env.BCC_ADDRESSES;
  bccAddresses.forEach(address => {
    const bccAddress = {
      'Email': address,
    };
    bcc.push(bccAddress);
  });

  const bccSender = {
    'Email': message.from,
  };
  if (env.BCC_HIDDEN_SENDER && !bcc.includes(bccSender) && env.HIDE_ADDRESSES.includes(message.from)) {
    bcc.push(bccSender);
  }

  if (env.ENABLE_LOGS) {
    let bccList = bcc.map((item) => {
      return item.Email;
    }).join(", ");
    console.log("BCC to " + bccList);
  }

  return bcc;
}

function getMailjetBody(fromEmail, fromName, toEmail, toName, message, env, parsedEmail) {
  let body = {
    'Messages': [
      {
        'From': {
          'Email': fromEmail,
          'Name': fromName,
        },
        'To': [
          {
            'Email': toEmail,
            'Name': toName,
          },
        ],
        'Subject': message.headers.get("subject"),
        'TextPart': parsedEmail.text,
        'HTMLPart': parsedEmail.html,
      }
    ]
  };

  const bcc = getBcc(env, message);
  if (Array.isArray(bcc) && bcc.length != 0) {
    body.Messages[0].Bcc = bcc;
  }

  const campaignName = env.CAMPAIGN_NAME
  if (campaignName) {
    body.Messages[0].CustomCampaign = campaignName;
  }

  if (env.ENABLE_LOGS) {
    console.log("Mailjet body: ", body);
  }

  return JSON.stringify(body);
}

async function sendEmailWithMailjet(fromEmail, fromName, toEmail, toName, message, env, parsedEmail) {
  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${ env.MAILJET_PUBLIC_KEY }:${ env.MAILJET_SECRET_KEY }`).toString('base64'),
    },
    body: getMailjetBody(fromEmail, fromName, toEmail, toName, message, env, parsedEmail)
  }).catch(function (error) {
    if (env.ENABLE_LOGS) {
      console.log("Error from mailjet:");
      console.log(error);
    }
  });
  
  if (env.ENABLE_LOGS) {
    const json = await response.json();
    console.log("Receieved JSON Response:", json);
    console.log("Response status: " + json.Messages[0].Status);
  }
}
