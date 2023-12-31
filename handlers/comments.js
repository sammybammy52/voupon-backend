import { COMMENTS, REPLIES } from "../ds/conn";

const new_comment = (req, res) => {
  let comment = req.body;

  let result = COMMENTS.write(comment);

  res.json({
    ok: true,
    message: "new comment",
    data: { _id: result._id, created: result.created },
  });
};

const comment_like = (req, res) => {
  let { comment, item } = req.body;

  (comment.startsWith("comment") ? COMMENTS : REPLIES).update(
    {
      _id: comment,
      [comment.startsWith("comment") ? "item" : "comment"]: item,
    },
    { likes: { $inc: 1 } }
  );

  res.end();
};

const comment_dislike = (req, res) => {
  let { comment, item } = req.body;

  (comment.startsWith("comment") ? COMMENTS : REPLIES).update(
    {
      _id: comment,
      [comment.startsWith("comment") ? "item" : "comment"]: item,
    },
    { dislikes: { $inc: 1 } }
  );

  res.end();
};

const comment_heart = (req, res) => {
  let { comment, item } = req.body;

  (comment.startsWith("comment") ? COMMENTS : REPLIES).update(
    {
      _id: comment,
      [comment.startsWith("comment") ? "item" : "comment"]: item,
    },
    { hearts: { $inc: 1 } }
  );

  res.end();
};

const comment_rating = (req, res) => {
  let { comment, item, rating } = req.body;

  (comment.startsWith("comment") ? COMMENTS : REPLIES).update(
    {
      _id: comment,
      [comment.startsWith("comment") ? "item" : "comment"]: item,
    },
    { [String(rating)]: { $inc: 1 } }
  );

  res.end();
};

const new_reply = (req, res) => {
  let reply = req.body;

  let result = REPLIES.write(reply);

  res.json({
    ok: true,
    message: "new reply",
    data: { _id: result._id, created: result.created },
  });
};

const comments = (req, res) => {
  let { limit, skip, item } = req.body;

  res.json({
    ok: true,
    message: "comments",
    data: COMMENTS.read({ item }, { limit: Number(limit), skip: Number(skip) }),
  });
};

const replies = (req, res) => {
  let { limit, skip, comment } = req.body;

  res.json({
    ok: true,
    message: "replies",
    data: REPLIES.read(
      { comment },
      { limit: Number(limit), skip: Number(skip) }
    ),
  });
};

export {
  new_comment,
  comment_rating,
  comment_dislike,
  comment_heart,
  comment_like,
  new_reply,
  comments,
  replies,
};
