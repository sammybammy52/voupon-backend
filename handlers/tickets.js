import { generate_random_string } from "generalised-datastore/utils/functions";
import {
  EVENTS,
  EVENT_TICKETS,
  TICKETS,
  TRANSACTIONS,
  USERS,
  USER_TICKETS,
  VENDORS,
  VENDOR_EVENTS,
  WALLETS,
} from "../ds/conn";
import { voucher_otp_email, voucher_purchased_email } from "./emails";
import { send_mail } from "./users";
import { save_image } from "./utils";
import { reset_vendor_id } from "./voucher";

const ticket_otp = new Object();

const create_event = (req, res) => {
  let event = req.body;

  event.images = event.images.map((img) => {
    img.url = save_image(img.url);

    return img;
  });
  let result = EVENTS.write(event);
  event._id = result._id;
  event.created = result.created;

  event._id && VENDOR_EVENTS.write({ event: event._id, vendor: event.vendor });

  res.json({
    ok: true,
    message: "event created",
    data: event,
  });
};

const vendor_events = (req, res) => {
  let { vendor } = req.body;

  res.json({
    ok: true,
    message: "vouchers",
    data: VENDOR_EVENTS.read({ vendor }),
  });
};

const events = (req, res) => {
  let { limit, skip } = req.body;

  let events_ = EVENTS.read(null, { limit: Number(limit), skip: Number(skip) });

  res.json({ ok: true, message: "events", data: { events: events_ } });
};

const ticket_purchased = (req, res) => {
  let details = req.body;
  let { user, email } = details;

  let firstname, lastname;
  if (!user) {
    user = USERS.readone({ email });
    if (!user)
      return res.json({ ok: false, data: { message: "User not found" } });
    firstname = user.firstname;
    lastname = user.lastname;
    user = user._id;
  }

  let ticket_code = generate_random_string(6, "alpha").toUpperCase();

  let event = EVENTS.update(
    { _id: details.event },
    {
      total_sales: { $inc: 1 },
      quantity: { $dec: 1 },
    }
  );

  let ticket = {
    ticket_code,
    event: event._id,
    user,
  };
  let ticket_res = TICKETS.write(ticket);
  ticket._id = ticket_res._id;
  ticket.created = ticket_res.created;

  EVENT_TICKETS.write({
    ticket: ticket._id,
    user,
    event: event._id,
    ticket_code,
  });

  USER_TICKETS.write({
    ticket_code,
    vendor: details.vendor,
    event: event._id,
    ticket: ticket._id,
    user,
  });

  let tx = {
    event: details.event,
    user,
    type: "ticket",
    title: "ticket purchased",
    vendor: details.vendor,
    ticket_code,
    value: event.value,
    credit: true,
  };

  TRANSACTIONS.write(tx);

  send_mail({
    recipient: details.email,
    recipient_name: `${firstname} ${lastname}`,
    subject: "[Voucher Africa] Ticket Purchased",
    sender: "signup@udaralinksapp.com",
    sender_name: "Voucher Africa",
    sender_pass: "signupudaralinks",
    html: voucher_purchased_email({ ...details, ticket_code }),
  });

  res.json({
    ok: true,
    message: "ticket purchased",
    data: { ticket_code, _id: ticket_res._id, created: ticket_res.created },
  });
};

const user_tickets = (req, res) => {
  let { user } = req.body;

  let tickets = USER_TICKETS.read({ user });

  res.json({ ok: false, message: "User tickets", data: tickets });
};

const event_tickets = (req, res) => {
  let { event } = req.body;

  let tickets = EVENT_TICKETS.read({ event });

  res.json({ ok: true, message: "event tickets", data: tickets });
};

const can_redeem_ticket = (req, res) => {
  let { ticket_code, vendor, user, email } = req.body;

  if (!user && !email) {
    return res.json({
      ok: false,
      data: { message: "No user credentials found!" },
    });
  }
  if (!user && email) {
    user = USERS.readone({ email });
    if (!user)
      return res.json({ ok: false, data: { message: "User not found" } });

    user = user._id;
  }

  let ticket = USER_TICKETS.readone({ ticket_code, user });

  if (!ticket)
    return res.json({
      ok: false,
      message: "cannot redeem ticket",
      data: { message: "Ticket not found" },
    });

  if (vendor && ticket.vendor !== vendor)
    return res.json({
      ok: false,
      data: { message: "ticket does not belong to vendor" },
    });

  if (ticket.state && ticket.state !== "unused")
    return res.json({
      ok: false,
      data: { message: `Ticket has been ${ticket.state}` },
    });

  res.json({
    ok: true,
    message: "can redeem ticket",
    data: {
      can_redeem: true,
      ticket_code: ticket.ticket_code,
      user,
      vendor: ticket.vendor,
      event: ticket.event._id,
    },
  });
};

const request_ticket_otp = (req, res) => {
  let { ticket_code, user, email } = req.body;

  if (!user && email) {
    user = USERS.readone({ email });
    user = user && user._id;

    if (!user) return res.json({ ok: false, message: "User not found" });
  } else if (!email && user) email = USERS.readone(user).email;

  let code = generate_random_string(6, "num");
  let ticket = TICKETS.readone({ ticket_code });

  if (!ticket) return res.json({ ok: false });

  let { _id } = ticket;

  ticket_otp[ticket._id] = Number(code);

  let { firstname, lastname } = USERS.readone(user);

  if (!email) {
    email = USERS.readone(user);
    email = email && email.email;
    if (!email)
      return res.json({ ok: false, data: { message: "Email not found" } });
  }

  send_mail({
    recipient: email,
    recipient_name: `${firstname} ${lastname}`,
    subject: "[Voucher Africa] Ticket OTP",
    sender: "signup@udaralinksapp.com",
    sender_name: "Voucher Africa",
    sender_pass: "signupudaralinks",
    html: voucher_otp_email({ ...ticket, code }),
  });

  res.json({
    ok: true,
    message: "ticket otp sent",
    data: { ticket: _id, email, user, event: ticket.event._id },
  });
};

const use_ticket = (req, res) => {
  let { vendor, event, otp, ticket, user } = req.body;

  if (!vendor) vendor = req.header.vendor_id;
  else {
    if (vendor && !vendor.startsWith("vendor"))
      vendor = reset_vendor_id(vendor);
  }

  if (!otp || Number(otp) !== ticket_otp[ticket])
    return res.json({
      ok: false,
      message: "ticket otp registration failed",
      data: { otp, ticket, message: "Ticket OTP validation failed" },
    });

  ticket = TICKETS.readone(ticket);
  USER_TICKETS.readone({ ticket, user });

  vendor = VENDORS.readone(vendor);

  let value = Number(ticket.event.value);

  WALLETS.update(vendor.wallet, { tickets: { $inc: value } });

  let tx = {
    wallet: vendor.wallet,
    ticket: ticket._id,
    customer: user,
    type: "ticket",
    title: "ticket used",
    vendor: vendor._id,
    ticket_code: ticket.ticket_code,
    value,
    credit: true,
    data: event,
  };

  TRANSACTIONS.write(tx);
  delete tx.wallet;
  tx.user = user;
  tx.credit = false;
  TRANSACTIONS.write(tx);

  USER_TICKETS.update({ user, ticket: ticket._id }, { state: "used" });
  EVENT_TICKETS.update({ ticket: ticket._id, event }, { state: "used" });
  ticket = TICKETS.update({ _id: ticket._id }, { state: "used" });

  res.json({
    ok: true,
    data: { success: true, ticket, vendor, user: USERS.readone(user) },
  });
};

const verify_ticket = (req, res) => {
  let { email, ticket_code } = req.body;

  let user = USERS.readone({ email });
  if (!user)
    return res.json({ ok: false, data: { message: "User not found!" } });

  user = user._id;

  let user_ticket = USER_TICKETS.readone({ ticket_code, user });
  if (!user_ticket)
    return res.json({
      ok: false,
      data: {
        message: `User does not have ticket with ticket code - ${ticket_code}`,
      },
    });

  let ticket = TICKETS.readone(user_ticket.ticket);

  res.json({
    ok: true,
    message: "verify ticket",
    data: { ticket, verified: true, state: user_ticket.state },
  });
};

const upcoming_events = (req, res) => {
  let { limit } = req.params;

  let events = EVENTS.read(
    { event_date_time: { $gt: Date.now() } },
    { limit: Number(limit) }
  );

  res.json({ ok: true, message: "upcoming events", data: events });
};

export {
  create_event,
  upcoming_events,
  request_ticket_otp,
  vendor_events,
  events,
  ticket_purchased,
  event_tickets,
  use_ticket,
  verify_ticket,
  can_redeem_ticket,
  user_tickets,
};