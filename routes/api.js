'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas!'))
  .catch(err => console.error('Connection error:', err));

const boardSchema = new Schema({
  name: { type: String, required: true, unique: true }, // Ensure unique board names
  threads: [{ type: Schema.Types.ObjectId, ref: 'Thread' }]
})

const replySchema = new Schema({
  thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
  text: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false },
  delete_password: { type: String, required: true },
  board: { type: String, required: true }
});

const threadSchema = new mongoose.Schema({
  board: String,
  text: String,
  delete_password: String,
  created_on: { type: Date, default: Date.now },
  bumped_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false },
  replies: { type: [replySchema], default: [] }
});




const Thread = mongoose.model('Thread', threadSchema);
const Reply = mongoose.model('Reply', replySchema);
const Board = mongoose.model('Board', boardSchema);

module.exports = function (app) {

  app.route('/api/threads/:board').post(function (req, res) {
    // Handle thread creation
    let board = req.body.board || req.params.board; // Use board from body or params
    if (!board) {
      return res.status(400).json({ error: 'Board name is required' });
    }
    const { text, delete_password } = req.body;
    if (!text || !delete_password) {
      return res.status(400).json({ error: 'Text and delete_password are required' });
    }
    // Check if the board exists, if not create it
    let newBoard;
    Board.findOne({ name: board })
      .then(existingBoard => {
        if (!existingBoard) {
          const createdBoard = new Board({ name: board, threads: [] });
          return createdBoard.save(); // Return the promise so the next .then() has access to the saved board
        }
        return existingBoard; // Pass the existing board along
      })
      .then(boardDoc => {
        newBoard = boardDoc;

        const newThread = new Thread({
          board,
          text,
          delete_password,
          created_on: new Date(),
          bumped_on: new Date(),
          reported: false,
          replies: []
        });


        return newThread.save();
      })
      .then(thread => {
        newBoard.threads.push(thread);
        return newBoard.save().then(() => {
          // return res.json({
          //   _id: thread._id,
          //   text: thread.text,
          //   created_on: thread.created_on,
          //   bumped_on: thread.bumped_on,
          //   replies: thread.replies
          // });
          return res.json(thread);
        });
      })
      .catch(err => {
        console.error('Error handling thread creation:', err);
        return res.status(500).json({ error: 'Server error' });
      });

  }).get(function (req, res) {
    // Handle fetching threads
    const { board } = req.params;
    if (!board) {
      return res.status(400).json({ error: 'Board name is required' });
    }
    Board.findOne({ name: board }).then(foundBoard => {
      if (!foundBoard) {
        return res.status(404).json({ error: 'Board not found' });
      } else {
        Thread.find({ board: foundBoard.name })
          .sort({ bumped_on: -1 })
          .limit(10)
          .populate('replies', '-delete_password -reported')
          .then(threads => {
            // Format threads for response
            const formattedThreads = threads.map(thread => ({
              _id: thread._id,
              text: thread.text,
              created_on: thread.created_on,
              bumped_on: thread.bumped_on,
              replies: thread.replies.slice(-3).map(r => ({
                _id: r._id,
                text: r.text,
                created_on: r.created_on
              }))
            }));

            console.log('Fetched threads:', formattedThreads);
            res.json(formattedThreads);
          })
          .catch(err => res.status(500).json({ error: 'Failed to fetch threads' }));
      }

    })
  });

  app.route('/api/replies/:board').post(function (req, res) {
    // Handle reply creation
    const { board } = req.params;
    const { thread_id, text, delete_password } = req.body;
    if (!thread_id || !text || !delete_password) {
      return res.status(400).json({ error: 'Thread ID, text, and delete_password are required' });
    }
    Thread.findById(thread_id)
      .then(thread => {
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        const newReply = new Reply({
          thread: thread_id,
          text,
          delete_password,
          board
        });
        console.log('Creating new reply:', newReply);

        return newReply.save().then(reply => {
          thread.replies.push({ _id: reply._id, text: reply.text, created_on: reply.created_on, delete_password: reply.delete_password, reported: reply.reported });
          thread.bumped_on = Date.now();
          return thread.save().then(() => res.json(reply));
        });
      })
      .catch(err => res.status(500).json({ error: 'Failed to create reply' }));
  });

};
