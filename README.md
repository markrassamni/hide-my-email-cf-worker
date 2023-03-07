# Table of Contents
- [Introduction](#introduction)
- [Requirements](#requirements)
- [Setup Guide](#setup-guide)
  - [Environment Configuration](#environment-configuration)
    - [Secrets](#secrets)
      - [Mailjet](#mailjet)
    - [Variables](#variables)
- [Sending an email](#sending-an-email)
  - [Structure of an Address](#structure-of-an-address)
  - [Notes](#notes)
  - [Unsupported Features](#unsupported-features)
    - [May eventually support](#may-eventually-support)
    - [Will not be supported](#will-not-be-supported)
- [License](#license)
# Introduction
**hide-my-email-cf-worker** is a Cloudflare email worker that will:
* Block emails from sent from addresses in your blocklist
* Forward emails from you to your custom domain (i.e. secret<nolink>@mydomain.com) to a recipient
* Forward emails receieved at your custom domain to you.

# Requirements
* Website set up on Cloudflare that allows for Email Workers
* Account and API access with one of these supported mail providers:
  * Mailjet
* Own or purchase a domain to send emails from
* Access to DNS records of your domain to configure as needed with your mail provider.


# Setup Guide
1. Clone the project
   
   ```
   wrangler generate hide-my-email https://github.com/markrassamni/hide-my-email-cf-worker
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Modify env vars as needed See [Environment Configuration](#environment-configuration)
4. Publish the worker

   ```
   wrangler publish
   ```
5. Configure your Cloudflare website email routing to use the worker
   1. Enable a catch-all address
   2. Set its action to send to worker and destination to your published worker

## Environment Configuration

### Secrets
The following secret keys are available and are needed based on your mail provider. They can be set via
```
wrangler secret put <key_name>
```

#### Mailjet
`MAILJET_PUBLIC_KEY` - Your public key for Mailjet

`MAILJET_SECRET_KEY` - Your secret key for Mailjet

### Variables
The following environment variables and values are available. Default values are shown in **bold**.

`ENABLE_LOGS` (bool: `true` | **`false`**) - will print statements to the console that can be useful for debugging.

`MAIL_PROVIDER` (string: **`Mailjet`**) - Currently only Mailjet is supported. May expand to other providers in the future.

`BCC_HIDDEN_SENDER` (bool: `true` | **`false`**) - all emails sent from an address in `HIDE_ADDRESSES` will BCC the sender.

`BCC_ADDRESSES` (array: **`[]`** | `["me@domain.com", "wife@domain.com", ...]`) - All mail sent will be BCCed to these addresses.

`HIDE_ADDRESSES` (array: `["admin@gmail.com", "admin2@otherexample.com", ...]`) - when the worker receieves an email from an address in this array it will send an email to the designated sender from your custom domain.

`BLOCKED` (array: `["hacker@example.com", "spammer@example.com", ...]`) - addresses in this array will have their email dropped when receieved by the worker. This will apply to all of your email aliases. To block sends to a single address on your domain, on your Cloudflare email routing dashboard create a custom address with the action *Drop*.

`FORWARD_TO` (string: `"realaddress@example.com"`) - when the worker receieves an email from an address outside of `BLOCKED` and `HIDE_ADDRESSES`, the message will be forwarded to this address.

`DEFAULT_FROM_NAME` (string: `"My Name"` | **`null`**) - If no name is provided in the email alias then this name will be used instead. If a name is provided this will be overwritten for that send. See [Structure of an Address](#structure-of-an-address) for how to add your name to an alias.

`CAMPAIGN_NAME` (string: **`"Hide My Email"`** | `null`) - If set, all emails sent through your mail delivery service will be tagged with this campaign name. This can be useful if you use that service outside of this project and would like to filter emails sent through this project only. 

`FORWARD_FROM_CLOUDFLARE` (bool: `true` | **`false`**) - By default (when set to false) emails forwarded to you will come from your domain instead of from the original sender. This will allow you to use the reply function in your email client without having to manually craft the address you want to send to. When true, all emails sent to your custom domain will be passed through the cloudflare worker's `message.forward()` function. This may be useful if you are trying to minimize your mail provider's usage costs, but if you reply to this email without changing the To address you will expose your real email address.

`MY_DOMAINS` (array: `["example.com", "domain.com", ...]`) - These domains are used when `FORWARD_FROM_CLOUDFLARE` is set to false to determine where to forward inbound emails to.

`DEFAULT_ALIAS` (string: `"myfakealias@mydomain.com"`) - If none of your domains in `MY_DOMAINS` are detected in an email sent to you, this default alias will be used as the fallback option.

# Sending an email
## Structure of an Address
youralias{your_name}+spammeruser{spammer_name}=spamdomain.com<nolink>@customdomain.com

When sending an email to the above address the relayed email details are:
* Sender: youralias<nolink>@customdomain.com \<Your Name>
* Recipient: spammeruser<nolink>@spamdomain.com \<Spammer Name>

One or both of the {name} fields can be ommitted. All of the following are valid addresses:
* youralias+spammeruser{spammer_name}=spamdomain.com<nolink>@customdomain.com
* youralias{your_name}+spammeruser=spamdomain.com<nolink>@customdomain.com
* youralias+spammeruser=spamdomain.com<nolink>@customdomain.com

## Notes
* The local part of an email address (the part before the @domain) should not exceed 64 characters. When dealing with long email addresses it may be best to exclude names. A small workaround to include your name without increasing address length is to set the `DEFAULT_FROM_NAME` environment variable. In my personal experience this has still worked when exceeding the limit of 64 but I would not count on it for 100% reliability.
* Be careful about using the reply button in your mail client to send an email if `FORWARD_FROM_CLOUDFLARE` is `true`. This can expose your real email address. To keep the existing thread, press reply and then delete the To email address and craft a new address as detailed in [Structure of an Address](#structure-of-an-address).

## Unsupported Features
### May eventually support
* More mail providers
* Forwarding attachments
* Change environment variable `ENABLE_LOGS` booloean to a log level that can log more/less info as needed
* Adding testing / validation with things such as but not limited to:
  * To/From address formats
  * Environment variables 

### Will not be supported
* Send an email with multiple recipients

# License
© 2023 Mark Rassamni

Licensed under GNU Affero General Public License v3.0 or later.